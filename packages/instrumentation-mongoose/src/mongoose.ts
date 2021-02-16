import { getSpan, context, suppressInstrumentation } from '@opentelemetry/api';
import type mongoose from 'mongoose';
import { MongooseInstrumentationConfig, SerializerPayload } from './types';
import { startSpan, setErrorStatus, handlePromiseResponse } from './utils';
import {
    InstrumentationBase,
    InstrumentationConfig,
    InstrumentationModuleDefinition,
    InstrumentationNodeModuleDefinition,
    safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import { VERSION } from './version';
import { DatabaseAttribute } from '@opentelemetry/semantic-conventions';

const contextCaptureFunctions = [
    'remove',
    'deleteOne',
    'deleteMany',
    'find',
    'findOne',
    'estimatedDocumentCount',
    'countDocuments',
    'count',
    'distinct',
    'where',
    '$where',
    'findOneAndUpdate',
    'findOneAndDelete',
    'findOneAndReplace',
    'findOneAndRemove',
];

type Config = InstrumentationConfig & MongooseInstrumentationConfig;

// when mongoose functions are called, we store the original call context
// and then set it as the parent for the spans created by Query/Aggregate exec()
// calls. this bypass the unlinked spans issue on thenables await operations.
export const _STORED_PARENT_SPAN: unique symbol = Symbol('stored-parent-span');

export class MongooseInstrumentation extends InstrumentationBase<typeof mongoose> {
    static readonly component = 'mongoose';
    protected _config: MongooseInstrumentationConfig;

    constructor(config: Config = {}) {
        super('opentelemetry-instrumentation-mongoose', VERSION, Object.assign({}, config));

        // According to specification, statement is not set by default on mongodb spans.
        if (!config.dbStatementSerializer) this._config.dbStatementSerializer = () => undefined;
    }

    setConfig(config: Config = {}) {
        this._config = Object.assign({}, config);
        if (!config.dbStatementSerializer) this._config.dbStatementSerializer = () => undefined;
        if (config.logger) this._logger = config.logger;
    }

    protected init(): InstrumentationModuleDefinition<typeof mongoose> {
        const module = new InstrumentationNodeModuleDefinition<typeof mongoose>(
            MongooseInstrumentation.component,
            ['*'],
            this.patch.bind(this),
            this.unpatch.bind(this)
        );
        return module;
    }

    protected patch(moduleExports: typeof mongoose) {
        this._logger.debug('mongoose instrumentation: patching');

        this._wrap(moduleExports.Model.prototype, 'save', this.patchOnModelMethods('save'));
        this._wrap(moduleExports.Model.prototype, 'remove', this.patchOnModelMethods('remove'));
        this._wrap(moduleExports.Query.prototype, 'exec', this.patchQueryExec());
        this._wrap(moduleExports.Aggregate.prototype, 'exec', this.patchAggregateExec());

        contextCaptureFunctions.forEach((funcName: string) => {
            this._wrap(moduleExports.Query.prototype, funcName as any, this.patchAndCaptureSpanContext(funcName));
        });
        this._wrap(moduleExports.Model, 'aggregate', this.patchModelAggregate());

        return moduleExports;
    }

    protected unpatch(moduleExports: typeof mongoose): void {
        this._logger.debug('mongoose instrumentation: unpatch mongoose');
        this._unwrap(moduleExports.Model.prototype, 'save');
        this._unwrap(moduleExports.Model.prototype, 'remove');
        this._unwrap(moduleExports.Query.prototype, 'exec');
        this._unwrap(moduleExports.Aggregate.prototype, 'exec');

        contextCaptureFunctions.forEach((funcName: string) => {
            this._unwrap(moduleExports.Query.prototype, funcName as any);
        });
        this._unwrap(moduleExports.Model, 'aggregate');
    }

    private patchAggregateExec() {
        const thisInstrumentation = this;
        thisInstrumentation._logger.debug('mongoose instrumentation: patched mongoose Aggregate exec prototype');
        return (originalExec: Function) => {
            return function exec(this: any) {
                const parentSpan = this[_STORED_PARENT_SPAN];
                const attributes = {
                    [DatabaseAttribute.DB_STATEMENT]: thisInstrumentation._config.dbStatementSerializer('aggregate', {
                        options: this.options,
                        aggregatePipeline: this._pipeline,
                    }),
                };

                const span = startSpan({
                    tracer: thisInstrumentation.tracer,
                    modelName: this._model?.modelName,
                    operation: 'aggregate',
                    attributes,
                    collection: this._model.collection,
                    parentSpan,
                });

                const aggregateResponse = thisInstrumentation._callOriginalFunction(() =>
                    originalExec.apply(this, arguments)
                );
                return handlePromiseResponse(aggregateResponse, span, thisInstrumentation?._config?.responseHook);
            };
        };
    }

    private patchQueryExec() {
        const thisInstrumentation = this;
        thisInstrumentation._logger.debug('mongoose instrumentation: patched mongoose Query exec prototype');
        return (originalExec: Function) => {
            return function exec(this: any, callback?: Function) {
                const parentSpan = this[_STORED_PARENT_SPAN];
                const attributes = {
                    [DatabaseAttribute.DB_STATEMENT]: thisInstrumentation._config.dbStatementSerializer(this.op, {
                        condition: this._conditions,
                        updates: this._update,
                        options: this.options,
                    }),
                };
                const span = startSpan({
                    tracer: thisInstrumentation.tracer,
                    modelName: this.model.modelName,
                    operation: this.op,
                    attributes,
                    parentSpan,
                    collection: this.mongooseCollection,
                });

                if (callback instanceof Function) {
                    return thisInstrumentation._callOriginalFunction(() =>
                        originalExec.apply(this, [
                            (err: Error, response: any) => {
                                if (err) {
                                    setErrorStatus(span, err);
                                } else {
                                    safeExecuteInTheMiddle(
                                        () => thisInstrumentation?._config?.responseHook(span, response),
                                        (e) => {
                                            if (e) {
                                                this._logger.error('mongoose instrumentation: responseHook error', e);
                                            }
                                        },
                                        true
                                    );
                                }
                                span.end();
                                return callback!(err, response);
                            },
                        ])
                    );
                } else {
                    const response = thisInstrumentation._callOriginalFunction(() =>
                        originalExec.apply(this, arguments)
                    );
                    return handlePromiseResponse(response, span, thisInstrumentation?._config?.responseHook);
                }
            };
        };
    }

    private patchOnModelMethods(op: string) {
        const thisInstrumentation = this;
        thisInstrumentation._logger.debug(`mongoose instrumentation: patched mongoose Model ${op} prototype`);
        return (originalOnModelFunction: Function) => {
            return function method(this: any, options?: any, callback?: Function) {
                const serializePayload: SerializerPayload = { document: this };
                if (options && !(options instanceof Function)) {
                    serializePayload.options = options;
                }
                const attributes = {
                    [DatabaseAttribute.DB_STATEMENT]: thisInstrumentation._config.dbStatementSerializer(
                        op,
                        serializePayload
                    ),
                };
                const span = startSpan({
                    tracer: thisInstrumentation.tracer,
                    modelName: this.constructor.modelName,
                    operation: op,
                    attributes,
                    collection: this.constructor.collection,
                });

                if (options instanceof Function) {
                    callback = options;
                    options = undefined;
                }

                if (callback instanceof Function) {
                    return thisInstrumentation._callOriginalFunction(() =>
                        originalOnModelFunction.apply(this, [
                            options,
                            (err: Error, response: any) => {
                                if (err) {
                                    setErrorStatus(span, err);
                                } else {
                                    safeExecuteInTheMiddle(
                                        () => thisInstrumentation?._config?.responseHook(span, response),
                                        (e) => {
                                            if (e) {
                                                this._logger.error('mongoose instrumentation: responseHook error', e);
                                            }
                                        },
                                        true
                                    );
                                }
                                span.end();
                                return callback!(err, response);
                            },
                        ])
                    );
                } else {
                    const response = thisInstrumentation._callOriginalFunction(() =>
                        originalOnModelFunction.apply(this, arguments)
                    );
                    return handlePromiseResponse(response, span, thisInstrumentation?._config?.responseHook);
                }
            };
        };
    }

    // we want to capture the otel span on the object which is calling exec.
    // in the special case of aggregate, we need have no function to path
    // on the Aggregate object to capture the context on, so we patch
    // the aggregate of Model, and set the context on the Aggregate object
    private patchModelAggregate() {
        const thisInstrumentation = this;
        thisInstrumentation._logger.debug(`mongoose instrumentation: patched mongoose model aggregate`);
        return (original: Function) => {
            return function captureSpanContext(this: any) {
                const currentSpan = getSpan(context.active());
                const aggregate = thisInstrumentation._callOriginalFunction(() => original.apply(this, arguments));
                if (aggregate) aggregate[_STORED_PARENT_SPAN] = currentSpan;
                return aggregate;
            };
        };
    }

    private patchAndCaptureSpanContext(funcName: string) {
        const thisInstrumentation = this;
        thisInstrumentation._logger.debug(`mongoose instrumentation: patched mongoose query ${funcName} prototype`);
        return (original: Function) => {
            return function captureSpanContext(this: any) {
                this[_STORED_PARENT_SPAN] = getSpan(context.active());
                return thisInstrumentation._callOriginalFunction(() => original.apply(this, arguments));
            };
        };
    }

    private _callOriginalFunction<T>(originalFunction: (...args: any[]) => T): T {
        if (this._config?.suppressInternalInstrumentation) {
            return context.with(suppressInstrumentation(context.active()), originalFunction);
        } else {
            return originalFunction();
        }
    }
}

import { Span, SpanKind, SpanStatusCode, trace, context, diag, createContextKey, Context } from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { TypeormInstrumentationConfig } from './types';
import { getParamNames, isTypeormInternalTracingSuppressed, suppressTypeormInternalTracing } from './utils';
import { VERSION } from './version';
import type * as typeorm from 'typeorm';
import {
    InstrumentationBase,
    InstrumentationModuleDefinition,
    InstrumentationNodeModuleDefinition,
    InstrumentationNodeModuleFile,
    isWrapped,
    safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import isPromise from 'is-promise';

type SelectQueryBuilderMethods = keyof typeorm.SelectQueryBuilder<any>;
const selectQueryBuilderExecuteMethods: SelectQueryBuilderMethods[] = [
    'getRawOne',
    'getCount',
    'getManyAndCount',
    'stream',
    'getMany',
    'getOneOrFail',
    'getOne',
    'getRawAndEntities',
    'getRawMany',
];

export class TypeormInstrumentation extends InstrumentationBase<typeof typeorm> {
    protected override _config!: TypeormInstrumentationConfig;

    constructor(config: TypeormInstrumentationConfig = {}) {
        super('opentelemetry-instrumentation-typeorm', VERSION, Object.assign({}, config));
    }

    protected init(): InstrumentationModuleDefinition<typeof typeorm> {
        const selectQueryBuilder = new InstrumentationNodeModuleFile<typeof typeorm>(
            'typeorm/query-builder/SelectQueryBuilder.js',
            ['>0.2.28'],
            (moduleExports, moduleVersion) => {
                selectQueryBuilderExecuteMethods.map((method) => {
                    if (isWrapped(moduleExports.SelectQueryBuilder.prototype?.[method])) {
                        this._unwrap(moduleExports.SelectQueryBuilder.prototype, method);
                    }
                    this._wrap(
                        moduleExports.SelectQueryBuilder.prototype,
                        method,
                        this._patchQueryBuilder(moduleVersion)
                    );
                });

                return moduleExports;
            },
            (moduleExports) => {
                selectQueryBuilderExecuteMethods.map((method) => {
                    if (isWrapped(moduleExports.SelectQueryBuilder.prototype?.[method])) {
                        this._unwrap(moduleExports.SelectQueryBuilder.prototype, method);
                    }
                });
                return moduleExports;
            }
        );

        const module = new InstrumentationNodeModuleDefinition<typeof typeorm>(
            'typeorm',
            ['>0.2.28'],
            (moduleExports, moduleVersion: string | undefined) => {
                if (moduleExports === undefined || moduleExports === null) {
                    return moduleExports;
                }
                if (isWrapped(moduleExports.ConnectionManager.prototype.create)) {
                    this._unwrap(moduleExports.ConnectionManager.prototype, 'create');
                }
                this._wrap(
                    moduleExports.ConnectionManager.prototype,
                    'create',
                    this._createConnectionManagerPatch(moduleVersion)
                );

                return moduleExports;
            },
            (moduleExports) => {
                if (isWrapped(moduleExports.ConnectionManager.prototype.create)) {
                    this._unwrap(moduleExports.ConnectionManager.prototype, 'create');
                }
            },
            [selectQueryBuilder]
        );
        return module;
    }

    private _createConnectionManagerPatch(moduleVersion?: string) {
        const self = this;
        return (original: Function) => {
            return function (options: typeorm.ConnectionOptions) {
                const connection: typeorm.Connection = original.apply(this, arguments);

                // Both types using same patch right now, keep different declarations for future improvements
                const functionsUsingEntityPersistExecutor = ['save', 'remove', 'softRemove', 'recover'];
                const functionsUsingQueryBuilder = [
                    'insert',
                    'update',
                    'delete',
                    'softDelete',
                    'restore',
                    'count',
                    'find',
                    'findAndCount',
                    'findByIds',
                    'findOne',
                    'increment',
                    'decrement',
                ];

                const patch = (operation: string) => {
                    if (connection.manager[operation])
                        self._wrap(
                            connection.manager,
                            operation as keyof typeorm.EntityManager,
                            self._getEntityManagerFunctionPatch(operation, moduleVersion).bind(self)
                        );
                };

                functionsUsingEntityPersistExecutor.forEach(patch);
                functionsUsingQueryBuilder.forEach(patch);
                return connection;
            };
        };
    }

    private _getEntityManagerFunctionPatch(opName: string, moduleVersion?: string) {
        const self = this;
        diag.debug(`typeorm instrumentation: patched EntityManager ${opName} prototype`);
        return function (original: Function) {
            return async function (...args: any[]) {
                const connectionOptions = this?.connection?.options ?? {};
                const attributes = {
                    [SemanticAttributes.DB_SYSTEM]: connectionOptions.type,
                    [SemanticAttributes.DB_USER]: connectionOptions.username,
                    [SemanticAttributes.NET_PEER_NAME]: connectionOptions.host,
                    [SemanticAttributes.NET_PEER_PORT]: connectionOptions.port,
                    [SemanticAttributes.DB_NAME]: connectionOptions.database,
                    [SemanticAttributes.DB_OPERATION]: opName,
                    [SemanticAttributes.DB_STATEMENT]: JSON.stringify(buildStatement(original, args)),
                };

                if (self._config.moduleVersionAttributeName && moduleVersion) {
                    attributes[self._config.moduleVersionAttributeName] = moduleVersion;
                }

                //ignore EntityMetadataNotFoundError
                try {
                    if (this.metadata) {
                        attributes[SemanticAttributes.DB_SQL_TABLE] = this.metadata.tableName;
                    } else {
                        const entity = args[0];
                        const name = typeof entity === 'object' ? entity?.constructor?.name : entity;
                        const metadata = this.connection.getMetadata(name);
                        if (metadata?.tableName) {
                            attributes[SemanticAttributes.DB_SQL_TABLE] = metadata.tableName;
                        }
                    }
                } catch {}

                Object.entries(attributes).forEach(([key, value]) => {
                    if (value === undefined) delete attributes[key];
                });

                const span: Span = self.tracer.startSpan(`TypeORM ${opName}`, {
                    kind: SpanKind.CLIENT,
                    attributes,
                });

                const contextWithSpan = trace.setSpan(context.active(), span);

                const traceContext = self._config.enableInternalInstrumentation
                    ? contextWithSpan
                    : suppressTypeormInternalTracing(contextWithSpan);

                const contextWithSuppressTracing = self._config.suppressInternalInstrumentation
                    ? suppressTracing(traceContext)
                    : traceContext;

                return context.with(contextWithSuppressTracing, () =>
                    self._endSpan(() => original.apply(this, arguments), span)
                );
            };
        };
    }

    private _patchQueryBuilder(moduleVersion: string) {
        const self = this;
        return (original: any) => {
            return function () {
                if (isTypeormInternalTracingSuppressed(context.active())) {
                    return original.apply(this, arguments);
                }
                const [sql, _parameters] = this.getQueryAndParameters();
                const mainTableName = this.getMainTableName();
                const operation = this.expressionMap.queryType;

                const connectionOptions = this?.connection?.options ?? {};
                const attributes = {
                    [SemanticAttributes.DB_SYSTEM]: connectionOptions.type,
                    [SemanticAttributes.DB_USER]: connectionOptions.username,
                    [SemanticAttributes.NET_PEER_NAME]: connectionOptions.host,
                    [SemanticAttributes.NET_PEER_PORT]: connectionOptions.port,
                    [SemanticAttributes.DB_NAME]: connectionOptions.database,
                    [SemanticAttributes.DB_OPERATION]: operation,
                    [SemanticAttributes.DB_STATEMENT]: sql,
                    [SemanticAttributes.DB_SQL_TABLE]: mainTableName,
                };
                const span: Span = self.tracer.startSpan(`TypeORM ${operation} ${mainTableName}`, {
                    kind: SpanKind.CLIENT,
                    attributes,
                });

                const contextWithSpan = trace.setSpan(context.active(), span);

                const traceContext = self._config.enableInternalInstrumentation
                    ? contextWithSpan
                    : suppressTypeormInternalTracing(contextWithSpan);

                const contextWithSuppressTracing = self._config?.suppressInternalInstrumentation
                    ? suppressTracing(traceContext)
                    : traceContext;

                return context.with(contextWithSuppressTracing, () =>
                    self._endSpan(() => original.apply(this, arguments), span)
                );
            };
        };
    }

    private _endSpan(traced: any, span: Span) {
        const executeResponseHook = (response: any) => {
            if (this._config?.responseHook) {
                safeExecuteInTheMiddle(
                    () => this._config.responseHook(span, response),
                    (e: Error) => {
                        if (e) diag.error('typeorm instrumentation: responseHook error', e);
                    },
                    true
                );
            }
            return response;
        };
        try {
            const response = traced();
            if (isPromise(response)) {
                return Promise.resolve(response)
                    .then((response) => executeResponseHook(response))
                    .catch((err) => {
                        if (err) {
                            if (typeof err === 'string') {
                                span.setStatus({ code: SpanStatusCode.ERROR, message: err });
                            } else {
                                span.recordException(err);
                                span.setStatus({ code: SpanStatusCode.ERROR, message: err?.message });
                            }
                        }
                        throw err;
                    })
                    .finally(() => span.end());
            } else {
                span.end();
                return executeResponseHook(response);
            }
        } catch (error: any) {
            span.recordException(error);
            span.setStatus({ code: SpanStatusCode.ERROR, message: error?.message });
            span.end();
            throw error;
        }
    }
}

const buildStatement = (func: Function, args: any[]) => {
    const paramNames = getParamNames(func);
    const statement = {};
    paramNames.forEach((pName, i) => {
        const value = args[i];
        if (!value) return;

        try {
            const stringified = JSON.stringify(value);
            if (stringified) {
                statement[pName] = args[i];
                return;
            }
        } catch (err) {}
        if (value?.name) {
            statement[pName] = value.name;
            return;
        }
        if (value?.constructor?.name) {
            statement[pName] = value.constructor.name;
        }
    });
    return statement;
};

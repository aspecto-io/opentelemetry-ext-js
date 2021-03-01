import { diag, context, suppressInstrumentation } from '@opentelemetry/api';
import type elasticsearch from '@elastic/elasticsearch';
import { ElasticsearchInstrumentationConfig } from './types';
import {
    InstrumentationBase,
    InstrumentationConfig,
    InstrumentationModuleDefinition,
    InstrumentationNodeModuleDefinition,
    InstrumentationNodeModuleFile,
} from '@opentelemetry/instrumentation';
import { VERSION } from './version';
import { DatabaseAttribute } from '@opentelemetry/semantic-conventions';
import { startSpan, onError, onResponse, defaultDbStatementSerializer, normalizeArguments } from './utils';
import { ELASTICSEARCH_API_FILES } from './helpers';

type Config = InstrumentationConfig & ElasticsearchInstrumentationConfig;

export class ElasticsearchInstrumentation extends InstrumentationBase<typeof elasticsearch> {
    static readonly component = '@elastic/elasticsearch';

    protected _config: ElasticsearchInstrumentationConfig;
    private _isEnabled = false;

    constructor(config: Config = {}) {
        super('opentelemetry-instrumentation-elasticsearch', VERSION, Object.assign({}, config));
    }

    setConfig(config: Config = {}) {
        this._config = Object.assign({}, config);
    }

    protected init(): InstrumentationModuleDefinition<typeof elasticsearch> {
        const apiModuleFiles = ELASTICSEARCH_API_FILES.map(
            ({ path, operationClassName }) =>
                new InstrumentationNodeModuleFile<any>(
                    `@elastic/elasticsearch/api/${path}`,
                    ['*'],
                    this.patch.bind(this, operationClassName),
                    this.unpatch.bind(this)
                )
        );

        const module = new InstrumentationNodeModuleDefinition<typeof elasticsearch>(
            ElasticsearchInstrumentation.component,
            ['*'],
            undefined,
            undefined,
            apiModuleFiles
        );

        return module;
    }

    private patchObject(operationClassName: string, object) {
        Object.keys(object).forEach((functionName) => {
            if (typeof object[functionName] === 'object') {
                this.patchObject(`${operationClassName}.${functionName}`, object[functionName]);
            } else {
                this._wrap(object, functionName, this.wrappedApiRequest.bind(this, operationClassName, functionName));
            }
        });
    }

    protected patch(operationClassName: string, moduleExports) {
        diag.debug(`elasticsearch instrumentation: patch elasticsearch ${operationClassName}.`);
        this._isEnabled = true;

        const modulePrototypeKeys = Object.keys(moduleExports.prototype);
        if (modulePrototypeKeys.length > 0) {
            modulePrototypeKeys.forEach((functionName) => {
                this._wrap(
                    moduleExports.prototype,
                    functionName,
                    this.wrappedApiRequest.bind(this, operationClassName, functionName)
                );
            });
            return moduleExports;
        }

        // For versions <= 7.9.0
        const self = this;
        return function (opts) {
            const module = moduleExports(opts);
            self.patchObject(operationClassName, module);
            return module;
        };
    }

    protected unpatch(moduleExports) {
        diag.debug(`elasticsearch instrumentation: unpatch elasticsearch.`);
        this._isEnabled = false;

        const modulePrototypeKeys = Object.keys(moduleExports.prototype);
        if (modulePrototypeKeys.length > 0) {
            modulePrototypeKeys.forEach((functionName) => {
                this._unwrap(moduleExports.prototype, functionName);
            });
        } else {
            // Unable to unwrap function for versions <= 7.9.0. Using _isEnabled flag instead.
        }
    }

    private wrappedApiRequest(apiClassName: string, functionName: string, originalFunction: Function) {
        const self = this;
        return function (...args) {
            if (!self._isEnabled) {
                return originalFunction.apply(this, args);
            }

            const [params, options, originalCallback] = normalizeArguments(args[0], args[1], args[2]);
            const span = startSpan({
                tracer: self.tracer,
                attributes: {
                    [DatabaseAttribute.DB_OPERATION]: `${apiClassName}.${functionName}`,
                    [DatabaseAttribute.DB_STATEMENT]: (
                        self._config.dbStatementSerializer || defaultDbStatementSerializer
                    )(params, options),
                },
            });

            if (originalCallback) {
                const wrappedCallback = function (err, result) {
                    if (err) {
                        onError(span, err);
                    } else {
                        onResponse(span, result, self._config.responseHook);
                    }

                    return originalCallback.call(this, err, result);
                };

                return self._callOriginalFunction(() => originalFunction.call(this, params, options, wrappedCallback));
            } else {
                const promise = self._callOriginalFunction(() => originalFunction.apply(this, args));
                promise.then(
                    (result) => {
                        onResponse(span, result, self._config.responseHook);
                        return result;
                    },
                    (err) => {
                        onError(span, err);
                        return err;
                    }
                );

                return promise;
            }
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

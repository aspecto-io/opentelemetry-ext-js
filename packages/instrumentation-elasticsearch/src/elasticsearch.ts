import { diag, context, SpanStatusCode, suppressInstrumentation } from '@opentelemetry/api';
import type elasticsearch from '@elastic/elasticsearch';
import { ApiError, ApiResponse } from '@elastic/elasticsearch';
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
import { startSpan, onResponse, defaultDbStatementSerializer } from './utils';
import { normalizeArguments } from '@elastic/elasticsearch/api/utils';

type Config = InstrumentationConfig & ElasticsearchInstrumentationConfig;

const apiFiles = [
    'async_search',
    'autoscaling',
    'cat',
    'ccr',
    'cluster',
    'dangling_indices',
    'enrich',
    'eql',
    'graph',
    'ilm',
    'indices',
    'ingest',
    'license',
    'logstash',
    'migration',
    'ml',
    'monitoring',
    'nodes',
    'rollup',
    'searchable_snapshots',
    'security',
    'slm',
    'snapshot',
    'sql',
    'ssl',
    'tasks',
    'text_structure',
    'transform',
    'watcher',
    'xpack',
];

export class ElasticsearchInstrumentation extends InstrumentationBase<typeof elasticsearch> {
    static readonly component = '@elastic/elasticsearch';
    protected _config: ElasticsearchInstrumentationConfig;

    constructor(config: Config = {}) {
        super('opentelemetry-instrumentation-elasticsearch', VERSION, Object.assign({}, config));
    }

    setConfig(config: Config = {}) {
        this._config = Object.assign({}, config);
    }

    protected init(): InstrumentationModuleDefinition<typeof elasticsearch> {
        const apiInstrumentationNodeModule = apiFiles.map((apiClassName) => {
            return new InstrumentationNodeModuleFile<any>(
                `@elastic/elasticsearch/api/api/${apiClassName}.js`,
                ['*'],
                this.patchApiClass.bind(this, apiClassName),
                this.unpatchApiClass.bind(this, apiClassName)
            );
        });

        apiInstrumentationNodeModule.push(
            new InstrumentationNodeModuleFile<any>(
                `@elastic/elasticsearch/api/index.js`,
                ['*'],
                this.patchApiClass.bind(this, 'client'),
                this.unpatchApiClass.bind(this)
            )
        );

        const module = new InstrumentationNodeModuleDefinition<typeof elasticsearch>(
            ElasticsearchInstrumentation.component,
            ['*'],
            undefined,
            undefined,
            apiInstrumentationNodeModule
        );

        normalizeArguments;

        return module;
    }

    protected patchApiClass(apiClassName, moduleExports) {
        Object.keys(moduleExports.prototype).forEach((functionName) => {
            this._wrap(moduleExports.prototype, functionName, this.patchApiFunc.bind(this, apiClassName, functionName));
        });

        return moduleExports;
    }

    protected unpatchApiClass(moduleExports) {
        diag.debug(`elasticsearch instrumentation: unpatch elasticsearch: ${moduleExports}`);

        Object.keys(moduleExports.prototype).forEach((functionName) => {
            this._unwrap(moduleExports.prototype, functionName);
        });

        return moduleExports;
    }

    private patchApiFunc(apiClassName: string, functionName: string, originalFunction: Function) {
        const self = this;
        const dbStatementSerializer = this._config.dbStatementSerializer || defaultDbStatementSerializer;
        return function (...args) {
            const [params, options, originalCallback] = normalizeArguments(...args);

            const span = startSpan({
                tracer: self.tracer,
                attributes: {
                    [DatabaseAttribute.DB_OPERATION]: `${apiClassName}.${functionName}`,
                    [DatabaseAttribute.DB_STATEMENT]: dbStatementSerializer(params, options),
                },
            });

            if (originalCallback) {
                const wrappedCallback = function (err: ApiError, result: ApiResponse) {
                    if (err) {
                        span.recordException(err);
                        span.setStatus({
                            code: SpanStatusCode.ERROR,
                            message: err.message,
                        });
                    } else {
                        onResponse(span, result, self._config.responseHook);
                    }
                    span.end();

                    return originalCallback.call(this, err, result);
                };

                return self._callOriginalFunction(() => originalFunction.call(this, params, options, wrappedCallback));
            } else {
                const promise = self._callOriginalFunction(() => originalFunction.apply(this, args));

                promise.then(
                    (result: ApiResponse) => {
                        onResponse(span, result, self._config.responseHook);
                        span.end();
                        return result;
                    },
                    (err: ApiError) => {
                        span.recordException(err);
                        span.setStatus({
                            code: SpanStatusCode.ERROR,
                            message: err.message,
                        });
                        span.end();
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

import { SpanStatusCode, diag, getSpan, context } from '@opentelemetry/api';
import { DatabaseAttribute } from '@opentelemetry/semantic-conventions';
import { VERSION } from './version';
import type * as neo4j from 'neo4j-driver';
import {
    InstrumentationBase,
    InstrumentationModuleDefinition,
    InstrumentationNodeModuleFile,
    InstrumentationNodeModuleDefinition,
    safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import { Neo4jInstrumentationConfig } from './types';
import { getAttributesFromNeo4jSession } from './utils';

type Neo4J = typeof neo4j;

export class Neo4jInstrumentation extends InstrumentationBase<Neo4J> {
    static readonly component = 'neo4j-driver';
    protected _config!: Neo4jInstrumentationConfig;

    constructor(config: Neo4jInstrumentationConfig = {}) {
        super('opentelemetry-instrumentation-neo4j', VERSION, Object.assign({}, config));
    }

    setConfig(config: Neo4jInstrumentationConfig = {}) {
        this._config = config;
    }

    protected init(): InstrumentationModuleDefinition<Neo4J> {
        const apiModuleFiles = new InstrumentationNodeModuleFile<neo4j.Session>(
            'neo4j-driver/lib/session.js',
            ['*'],
            this.patchSession.bind(this),
            this.unpatchSession.bind(this)
        );

        const module = new InstrumentationNodeModuleDefinition<Neo4J>(
            Neo4jInstrumentation.component,
            ['*'],
            undefined,
            undefined,
            [apiModuleFiles]
        );

        return module;
    }

    private patchSession(Session: { default: () => neo4j.Session }, moduleVersion: string) {
        const self = this;
        this._wrap(Session.default.prototype, 'run', (originalRun: neo4j.Session['run']) => {
            return function (query: string) {
                if (self._config?.ignoreOrphanedSpans && !getSpan(context.active())) {
                    return originalRun.apply(this, arguments);
                }
                
                const connectionAttributes = getAttributesFromNeo4jSession(this);
                const operation = query.split(/\s+/)[0];
                const span = self.tracer.startSpan(`Neo4j ${operation}`, {
                    attributes: {
                        ...connectionAttributes,
                        [DatabaseAttribute.DB_SYSTEM]: 'neo4j',
                        [DatabaseAttribute.DB_OPERATION]: operation,
                        [DatabaseAttribute.DB_STATEMENT]: query,
                    },
                });
                if (self._config.moduleVersionAttributeName) {
                    span.setAttribute(self._config.moduleVersionAttributeName, moduleVersion);
                }

                const response: neo4j.Result = originalRun.apply(this, arguments);

                const originalSubscribe = response.subscribe;
                response.subscribe = function (observer) {
                    const records = [];

                    if (observer.onKeys) {
                        return originalSubscribe.call(this, {
                            ...observer,
                            onKeys: function() {
                                span.end();
                                return observer.onKeys.apply(this, arguments);
                            }
                        })
                    }

                    return originalSubscribe.call(this, {
                        ...observer,
                        onNext: function (record: neo4j.Record) {
                            if (self._config.responseHook) {
                                records.push(record);
                            };
                            if (observer.onNext) observer.onNext.apply(this, arguments);
                        },
                        onCompleted: function (summary: neo4j.ResultSummary) {
                            if (self._config.responseHook) {
                                safeExecuteInTheMiddle(
                                    () => self._config.responseHook(span, { records: records, summary }),
                                    (e) => {
                                        if (e) {
                                            diag.error('neo4j instrumentation: responseHook error', e);
                                        }
                                    },
                                    true
                                );
                            }
                            span.end();
                            if (observer.onCompleted) observer.onCompleted.apply(this, arguments);
                        },
                        onError: function (err: Error) {
                            span.setStatus({
                                code: SpanStatusCode.ERROR,
                                message: err.message,
                            });
                            span.end();
                            if (observer.onError) observer.onError.apply(this, arguments);
                        },
                    });
                };

                return response;
            };
        });
        return Session;
    }

    private unpatchSession(Session: { default: () => neo4j.Session }) {
        this._unwrap(Session.default.prototype, 'run');
    }
}

import { SpanStatusCode, diag, trace, context, SpanKind } from '@opentelemetry/api';
import {
    SEMATTRS_DB_NAME,
    SEMATTRS_DB_OPERATION,
    SEMATTRS_DB_STATEMENT,
    SEMATTRS_DB_SYSTEM,
} from '@opentelemetry/semantic-conventions';
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

export class Neo4jInstrumentation extends InstrumentationBase {
    protected override _config!: Neo4jInstrumentationConfig;

    constructor(config: Neo4jInstrumentationConfig = {}) {
        super('opentelemetry-instrumentation-neo4j', VERSION, Object.assign({}, config));
    }

    override setConfig(config: Neo4jInstrumentationConfig = {}) {
        this._config = config;
    }

    protected init(): InstrumentationModuleDefinition[] {
        return [
            this.getModuleDefinition('neo4j-driver-core', ['>=4.3.0 <5']),
            this.getModuleDefinition('neo4j-driver', ['>=4.0.0 <4.3.0']),
        ];
    }

    private getModuleDefinition(name: string, supportedVersions: string[]): InstrumentationNodeModuleDefinition {
        const apiModuleFiles = ['session', 'transaction'].map(
            (file) =>
                new InstrumentationNodeModuleFile(
                    `${name}/lib/${file}.js`,
                    supportedVersions,
                    this.patchSessionOrTransaction.bind(this),
                    this.unpatchSessionOrTransaction.bind(this)
                )
        );

        const module = new InstrumentationNodeModuleDefinition(
            name,
            supportedVersions,
            undefined,
            undefined,
            apiModuleFiles
        );

        return module;
    }

    private patchSessionOrTransaction(
        fileExport: { default: () => neo4j.Session | neo4j.Transaction },
        moduleVersion: string
    ) {
        const self = this;
        this._wrap(fileExport.default.prototype, 'run', (originalRun: neo4j.Session['run']) => {
            return function (query: string) {
                if (self._config?.ignoreOrphanedSpans && !trace.getSpan(context.active())) {
                    return originalRun.apply(this, arguments);
                }

                const connectionAttributes = getAttributesFromNeo4jSession(this);
                const operation = query.trim().split(/\s+/)[0];
                const span = self.tracer.startSpan(`${operation} ${connectionAttributes[SEMATTRS_DB_NAME]}`, {
                    attributes: {
                        ...connectionAttributes,
                        [SEMATTRS_DB_SYSTEM]: 'neo4j',
                        [SEMATTRS_DB_OPERATION]: operation,
                        [SEMATTRS_DB_STATEMENT]: query,
                    },
                    kind: SpanKind.CLIENT,
                });
                if (self._config.moduleVersionAttributeName) {
                    span.setAttribute(self._config.moduleVersionAttributeName, moduleVersion);
                }

                const response: neo4j.Result = originalRun.apply(this, arguments);

                const originalSubscribe = response.subscribe;
                response.subscribe = function (observer) {
                    const records = [];

                    return originalSubscribe.call(this, {
                        ...observer,
                        onKeys: function (_keys: string[]) {
                            if (!observer.onKeys) return;
                            if (!observer.onCompleted) {
                                span.end();
                            }
                            return observer.onKeys.apply(this, arguments);
                        },
                        onNext: function (record: neo4j.Record) {
                            if (self._config.responseHook) {
                                records.push(record);
                            }
                            if (observer.onNext) return observer.onNext.apply(this, arguments);
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
                            if (observer.onCompleted) return observer.onCompleted.apply(this, arguments);
                        },
                        onError: function (err: Error) {
                            span.recordException(err);
                            span.setStatus({
                                code: SpanStatusCode.ERROR,
                                message: err.message,
                            });
                            span.end();
                            if (observer.onError) return observer.onError.apply(this, arguments);
                        },
                    });
                };

                return response;
            };
        });
        return fileExport;
    }

    private unpatchSessionOrTransaction(fileExport: { default: () => neo4j.Session | neo4j.Transaction }) {
        this._unwrap(fileExport.default.prototype, 'run');
    }
}

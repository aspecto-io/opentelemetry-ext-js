import { context, Span, SpanKind, SpanStatusCode, trace, diag } from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import { NetTransportValues, SemanticAttributes } from '@opentelemetry/semantic-conventions';
import * as sequelize from 'sequelize';
import { SequelizeAttributes, SequelizeInstrumentationConfig } from './types';
import { VERSION } from './version';
import { extractTableFromQuery } from './utils';
import {
    InstrumentationBase,
    InstrumentationModuleDefinition,
    InstrumentationNodeModuleDefinition,
    InstrumentationNodeModuleFile,
    isWrapped,
    safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';

export class SequelizeInstrumentation extends InstrumentationBase<typeof sequelize> {
    static readonly component = 'sequelize';
    protected override _config!: SequelizeInstrumentationConfig;
    private moduleVersion: string;

    constructor(config: SequelizeInstrumentationConfig = {}) {
        super('opentelemetry-instrumentation-sequelize', VERSION, Object.assign({}, config));
    }

    override setConfig(config: SequelizeInstrumentationConfig = {}) {
        this._config = Object.assign({}, config);
    }

    protected init(): InstrumentationModuleDefinition<typeof sequelize> {
        const connectionManagerInstrumentation = new InstrumentationNodeModuleFile<any>(
            'sequelize/lib/dialects/abstract/connection-manager.js',
            ['*'],
            this.patchConnectionManager.bind(this),
            this.unpatchConnectionManager.bind(this)
        );

        const module = new InstrumentationNodeModuleDefinition<typeof sequelize>(
            SequelizeInstrumentation.component,
            ['*'],
            this.patch.bind(this),
            this.unpatch.bind(this),
            [connectionManagerInstrumentation]
        );
        return module;
    }

    protected patchConnectionManager(moduleExports: any): any {
        if (moduleExports === undefined || moduleExports === null) {
            return moduleExports;
        }
        diag.debug(`sequelize instrumentation: applying patch to sequelize ConnectionManager`);
        this.unpatchConnectionManager(moduleExports);
        this._wrap(moduleExports.ConnectionManager.prototype, 'getConnection', this._getConnectionPatch.bind(this));
        return moduleExports;
    }

    protected unpatchConnectionManager(moduleExports: any): any {
        if (isWrapped(moduleExports?.ConnectionManager?.prototype?.getConnection)) {
            this._unwrap(moduleExports.ConnectionManager.prototype, 'getConnection');
        }
        return moduleExports;
    }

    protected patch(moduleExports: typeof sequelize, moduleVersion: string) {
        this.moduleVersion = moduleVersion;
        if (moduleExports === undefined || moduleExports === null) {
            return moduleExports;
        }

        diag.debug(`sequelize instrumentation: applying patch to sequelize`);
        this.unpatch(moduleExports);
        this._wrap(moduleExports.Sequelize.prototype, 'query', this._createQueryPatch.bind(this));

        return moduleExports;
    }

    protected unpatch(moduleExports: typeof sequelize): void {
        if (isWrapped(moduleExports.Sequelize.prototype.query)) {
            this._unwrap(moduleExports.Sequelize.prototype, 'query');
        }
    }

    // run getConnection with suppressTracing, as it might call internally to `databaseVersion` function
    // which calls `query` and create internal span which we don't need to instrument
    private _getConnectionPatch(original: Function) {
        return function (...args: unknown[]) {
            return context.with(suppressTracing(context.active()), () => original.apply(this, args));
        };
    }

    private _createQueryPatch(original: Function) {
        const self = this;
        return function query(sql: any, option: any) {
            if (self._config?.ignoreOrphanedSpans && !trace.getSpan(context.active())) {
                return original.apply(this, arguments);
            }

            let statement = sql?.query ? sql.query : sql;
            let operation = option?.type;

            if (typeof statement === 'string') {
                statement = statement.trim();
                if (!operation) operation = statement.split(' ')[0];
            }

            const sequelizeInstance: sequelize.Sequelize = this;
            const config = sequelizeInstance?.config;

            let tableName = option?.instance?.constructor?.tableName;
            if (!tableName) {
                if (Array.isArray(option?.tableNames) && option.tableNames.length > 0)
                    tableName = option?.tableNames.sort().join(',');
                else tableName = extractTableFromQuery(statement);
            }

            const attributes = {
                [SemanticAttributes.DB_SYSTEM]: sequelizeInstance.getDialect(),
                [SemanticAttributes.DB_USER]: config?.username,
                [SemanticAttributes.NET_PEER_NAME]: config?.host,
                [SemanticAttributes.NET_PEER_PORT]: config?.port ? Number(config?.port) : undefined,
                [SemanticAttributes.NET_TRANSPORT]: self._getNetTransport(config?.protocol),
                [SemanticAttributes.DB_NAME]: config?.database,
                [SemanticAttributes.DB_OPERATION]: operation,
                [SemanticAttributes.DB_STATEMENT]: self._getDbStatement(statement),
                [SemanticAttributes.DB_SQL_TABLE]: tableName,
                // [SemanticAttributes.NET_PEER_IP]: '?', // Part of protocol
                [SequelizeAttributes.RUNTIME_STACKTRACE]: self._getStacktrace(),
            };

            if (self._config.moduleVersionAttributeName) {
                attributes[self._config.moduleVersionAttributeName] = self.moduleVersion;
            }

            Object.entries(attributes).forEach(([key, value]) => {
                if (value === undefined) delete attributes[key];
            });

            const newSpan: Span = self.tracer.startSpan(`Sequelize ${operation}`, {
                kind: SpanKind.CLIENT,
                attributes,
            });

            const activeContextWithSpan = trace.setSpan(context.active(), newSpan);

            return context
                .with(
                    self._config.suppressInternalInstrumentation
                        ? suppressTracing(activeContextWithSpan)
                        : activeContextWithSpan,
                    () => original.apply(this, arguments)
                )
                .then((response: any) => {
                    if (self._config?.responseHook) {
                        safeExecuteInTheMiddle(
                            () => self._config.responseHook(newSpan, response),
                            (e: Error) => {
                                if (e) diag.error('sequelize instrumentation: responseHook error', e);
                            },
                            true
                        );
                    }
                    return response;
                })
                .catch((err: Error) => {
                    newSpan.setStatus({
                        code: SpanStatusCode.ERROR,
                        message: err.message,
                    });
                    throw err;
                })
                .finally(() => {
                    newSpan.end();
                });
        };
    }

    private _getNetTransport(protocol: string) {
        switch (protocol) {
            case 'tcp':
                return NetTransportValues.IP_TCP;
            default:
                return undefined;
        }
    }

    private _getDbStatement(statement: string): string | undefined {
        return this._config?.suppressSqlQuery !== true ? statement : undefined;
    }

    private _getStacktrace(): string | undefined {
        if (this._config.captureStackTrace !== true) {
            return undefined;
        }

        const stackContainer: { stack?: string } = {};

        Error.captureStackTrace(stackContainer);

        return (
            stackContainer.stack
                .split('\n')
                // Skip "Error:" line and current method
                .slice(2)
                .map((s) => s.trim())
                .join('\n')
        );
    }
}

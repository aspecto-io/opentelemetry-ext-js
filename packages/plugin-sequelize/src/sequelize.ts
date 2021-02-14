import { context, setSpan, Span, SpanKind, StatusCode, getSpan, Logger } from '@opentelemetry/api';
import { DatabaseAttribute, GeneralAttribute } from '@opentelemetry/semantic-conventions';
import * as sequelize from 'sequelize';
import { SequelizeInstrumentationConfig } from './types';
import { VERSION } from './version';
import {
    InstrumentationBase,
    InstrumentationConfig,
    InstrumentationModuleDefinition,
    InstrumentationNodeModuleDefinition,
    isWrapped,
    safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';

type Config = InstrumentationConfig & SequelizeInstrumentationConfig;

export class SequelizeInstrumentation extends InstrumentationBase<typeof sequelize> {
    static readonly component = 'sequelize';
    protected _config!: Config;

    constructor(config: Config = {}) {
        super('opentelemetry-instrumentation-sequelize', VERSION, Object.assign({}, config));
    }

    setConfig(config: Config = {}) {
        this._config = Object.assign({}, config);
    }

    get logger() {
        return this._config.logger ?? this._logger ?? ({} as Logger);
    }

    protected init(): InstrumentationModuleDefinition<typeof sequelize> {
        const module = new InstrumentationNodeModuleDefinition<typeof sequelize>(
            SequelizeInstrumentation.component,
            ['*'],
            this.patch.bind(this),
            this.unpatch.bind(this)
        );
        return module;
    }

    protected patch(moduleExports: typeof sequelize): typeof sequelize {
        if (moduleExports === undefined || moduleExports === null) {
            return moduleExports;
        }

        this.logger.debug(`applying patch to sequelize`);
        this.unpatch(moduleExports);
        this._wrap(moduleExports.Sequelize.prototype, 'query', this._createQueryPatch.bind(this));

        return moduleExports;
    }

    protected unpatch(moduleExports: typeof sequelize): void {
        if (isWrapped(moduleExports.Sequelize.prototype.query)) {
            this._unwrap(moduleExports.Sequelize.prototype, 'query');
        }
    }

    private _createQueryPatch(original: Function) {
        const thisPlugin = this;
        return function (sql: any, option: any) {
            if (thisPlugin._config?.ignoreOrphanedSpans && !getSpan(context.active())) {
                return original.apply(this, arguments);
            }

            let statement = sql?.query ? sql.query : sql;
            let operation = option.type;

            if (typeof statement === 'string') {
                statement = statement.trim();
                if (!operation) operation = statement.split(' ')[0];
            }

            const sequelizeInstance: sequelize.Sequelize = this;
            const config = sequelizeInstance?.config;

            const attributes = {
                [DatabaseAttribute.DB_SYSTEM]: sequelizeInstance.getDialect(),
                [DatabaseAttribute.DB_USER]: config?.username,
                [GeneralAttribute.NET_PEER_NAME]: config?.host,
                [GeneralAttribute.NET_PEER_PORT]: config?.port ? Number(config?.port) : undefined,
                [GeneralAttribute.NET_TRANSPORT]: thisPlugin._getNetTransport(config?.protocol),
                [DatabaseAttribute.DB_NAME]: config?.database,
                [DatabaseAttribute.DB_OPERATION]: operation,
                [DatabaseAttribute.DB_STATEMENT]: statement,
                component: 'sequelize',
                // [GeneralAttribute.NET_PEER_IP]: '?', // Part of protocol
            };

            Object.entries(attributes).forEach(([key, value]) => {
                if (value === undefined) delete attributes[key];
            });

            const newSpan: Span = thisPlugin.tracer.startSpan(`Sequelize ${operation}`, {
                kind: SpanKind.CLIENT,
                attributes,
            });

            return context
                .with(setSpan(context.active(), newSpan), () => original.apply(this, arguments))
                .then((response: any) => {
                    if (thisPlugin._config?.responseHook) {
                        safeExecuteInTheMiddle(
                            () => thisPlugin._config.responseHook(newSpan, response),
                            (e: Error) => {
                                if (e) thisPlugin.logger.error('Caught Error while applying responseHook', e);
                            },
                            true
                        );
                    }
                    return response;
                })
                .catch((err: Error) => {
                    newSpan.setStatus({
                        code: StatusCode.ERROR,
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
                return GeneralAttribute.IP_TCP;
            default:
                return undefined;
        }
    }
}

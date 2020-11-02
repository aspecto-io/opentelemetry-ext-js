import { BasePlugin } from '@opentelemetry/core';
import { Span, CanonicalCode, SpanKind } from '@opentelemetry/api';
import { DatabaseAttribute, GeneralAttribute } from '@opentelemetry/semantic-conventions';
import * as sequelize from 'sequelize';
import shimmer from 'shimmer';
import { SequelizePluginConfig } from './types';
import { VERSION } from './version';

class SequelizePlugin extends BasePlugin<typeof sequelize> {
    protected _config!: SequelizePluginConfig;

    constructor(readonly moduleName: string) {
        super(`opentelemetry-plugin-sequelize`, VERSION);
    }
    protected patch(): typeof sequelize {
        console.log('net', GeneralAttribute.IP_TCP);
        this._logger.debug(`applying patch to ${this.moduleName}@${this.version}`);
        shimmer.wrap(this._moduleExports.Sequelize.prototype, 'query', this._createQueryPatch.bind(this));

        return this._moduleExports;
    }
    protected unpatch(): void {
        shimmer.unwrap(this._moduleExports.Sequelize.prototype, 'query');
    }

    private _createQueryPatch(original: Function) {
        const thisPlugin = this;
        return function (sql: any, option: any) {
            if (thisPlugin._config.ignoreOrphanedSpans && !thisPlugin._tracer.getCurrentSpan()) {
                return original.apply(this, arguments);
            }

            const statement = sql?.query ? sql.query : sql;
            const operation = option.type ?? (typeof statement === 'string' ? statement.split(' ')[0] : undefined);
            const sequelizeInstance: sequelize.Sequelize = this;
            const config = sequelizeInstance?.config;

            const attributes = {
                [DatabaseAttribute.DB_SYSTEM]: sequelizeInstance.getDialect(),
                [DatabaseAttribute.DB_USER]: config?.username,
                [GeneralAttribute.NET_PEER_NAME]: config?.host,
                [GeneralAttribute.NET_PEER_PORT]: config?.port,
                [GeneralAttribute.NET_TRANSPORT]: thisPlugin._getNetTransport(config?.protocol),
                [DatabaseAttribute.DB_NAME]: config?.database,
                [DatabaseAttribute.DB_OPERATION]: operation,
                [DatabaseAttribute.DB_STATEMENT]: statement,
                component: 'typeorm',
                // [GeneralAttribute.NET_PEER_IP]: '?', // Part of protocol
            };

            Object.entries(attributes).forEach(([key, value]) => {
                if (value === undefined) delete attributes[key];
            });

            const newSpan: Span = thisPlugin._tracer.startSpan(`Sequelize ${operation}`, {
                kind: SpanKind.CLIENT,
                attributes,
            });

            return thisPlugin._tracer
                .withSpan(newSpan, () => original.apply(this, arguments))
                .then((response: any) => {
                    if (thisPlugin._config?.responseHook) {
                        try {
                            thisPlugin._config.responseHook(newSpan, response);
                        } catch (err) {
                            thisPlugin._logger?.error('Caught Error while applying responseHook', err);
                        }
                    }
                    return response;
                })
                .catch((err: Error) => {
                    newSpan.setStatus({
                        code: CanonicalCode.UNKNOWN,
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

export const plugin = new SequelizePlugin('sequelize');

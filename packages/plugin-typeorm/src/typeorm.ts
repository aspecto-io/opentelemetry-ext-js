import { BasePlugin } from '@opentelemetry/core';
import { Span, CanonicalCode, SpanKind } from '@opentelemetry/api';
import { DatabaseAttribute, GeneralAttribute } from '@opentelemetry/semantic-conventions';
import { TypeormPluginConfig } from './types';
import { safeExecute } from './utils/safe-execute';
import shimmer from 'shimmer';
import * as typeorm from 'typeorm';

const VERSION = '0.0.1';

class TypeormPlugin extends BasePlugin<typeof typeorm> {
    private connectionOptions: typeorm.ConnectionOptions;
    protected _config!: TypeormPluginConfig;

    constructor(readonly moduleName: string) {
        super(`opentelemetry-plugin-typeorm`, VERSION);
    }

    protected patch(): typeof typeorm {
        this._logger.debug(`applying patch to ${this.moduleName}@${this.version}`);
        shimmer.wrap(
            this._moduleExports.ConnectionManager.prototype,
            'create',
            this._getConnectionManagerPatch.bind(this)
        );

        return this._moduleExports;
    }
    protected unpatch(): void {
        shimmer.unwrap(this._moduleExports.ConnectionManager.prototype, 'create');
    }

    private _getConnectionManagerPatch(original: (options: typeorm.ConnectionOptions) => typeorm.Connection) {
        const thisPlugin = this;
        return function (options: typeorm.ConnectionOptions) {
            thisPlugin.connectionOptions = options;
            console.log(options);
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

            functionsUsingEntityPersistExecutor.forEach((op) =>
                shimmer.wrap(
                    connection.manager,
                    op as keyof typeorm.EntityManager,
                    thisPlugin._getEntityManagerFunctionPatch(op).bind(thisPlugin)
                )
            );

            functionsUsingQueryBuilder.forEach((op) =>
                shimmer.wrap(
                    connection.manager,
                    op as keyof typeorm.EntityManager,
                    thisPlugin._getEntityManagerFunctionPatch(op).bind(thisPlugin)
                )
            );

            return connection;
        };
    }

    private _getEntityManagerFunctionPatch(opName: string) {
        const thisPlugin = this;
        thisPlugin._logger.debug(`TypeormPlugin: patched EntityManager ${opName} prototype`);
        return function (original: Function) {
            return async function (...args: any[]) {
                const attributes = {
                    [DatabaseAttribute.DB_SYSTEM]: thisPlugin.connectionOptions.type,
                    [DatabaseAttribute.DB_USER]: (thisPlugin.connectionOptions as any).username,
                    // [GeneralAttribute.NET_PEER_IP]: '?',
                    [GeneralAttribute.NET_PEER_NAME]: (thisPlugin.connectionOptions as any).host,
                    [GeneralAttribute.NET_PEER_PORT]: (thisPlugin.connectionOptions as any).port,
                    // [GeneralAttribute.NET_TRANSPORT]: '?',
                    [DatabaseAttribute.DB_NAME]: thisPlugin.connectionOptions.database,
                    [DatabaseAttribute.DB_OPERATION]: opName,
                    [DatabaseAttribute.DB_STATEMENT]: JSON.stringify(args[0]),
                };

                Object.entries(attributes).forEach(([key, value]) => {
                    if (value === undefined) delete attributes[key];
                });

                const newSpan: Span = thisPlugin._tracer.startSpan(`TypeORM ${opName}`, { kind: SpanKind.CLIENT, attributes });

                const response: Promise<any> = thisPlugin._tracer.withSpan(newSpan, () =>
                    original.apply(this, arguments)
                );
                try {
                    const resolved = await response;
                    if (thisPlugin._config?.responseHook) {
                        safeExecute([], () => this._config.responseHook(newSpan, resolved), false);
                    }
                    newSpan.end();
                    return resolved;
                } catch (err) {
                    newSpan.setStatus({
                        code: CanonicalCode.UNKNOWN,
                        message: err.message,
                    });
                    newSpan.end();
                    throw err;
                }
            };
        };
    }
}

export const plugin = new TypeormPlugin('typeorm');

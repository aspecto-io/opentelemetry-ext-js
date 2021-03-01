import { Span, SpanKind, SpanStatusCode, setSpan, context, diag } from '@opentelemetry/api';
import { DatabaseAttribute, GeneralAttribute } from '@opentelemetry/semantic-conventions';
import { TypeormInstrumentationConfig } from './types';
import { getParamNames } from './utils';
import { VERSION } from './version';
import type * as typeorm from 'typeorm';
import {
    InstrumentationBase,
    InstrumentationModuleDefinition,
    InstrumentationNodeModuleDefinition,
    isWrapped,
    safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';

export class TypeormInstrumentation extends InstrumentationBase<typeof typeorm> {
    static readonly component = 'typeorm';
    protected _config!: TypeormInstrumentationConfig;
    private moduleVersion: string;

    constructor(config: TypeormInstrumentationConfig = {}) {
        super('opentelemetry-instrumentation-typeorm', VERSION, Object.assign({}, config));
    }

    setConfig(config: TypeormInstrumentationConfig = {}) {
        this._config = Object.assign({}, config);
    }

    protected init(): InstrumentationModuleDefinition<typeof typeorm> {
        const module = new InstrumentationNodeModuleDefinition<typeof typeorm>(
            TypeormInstrumentation.component,
            ['*'],
            this.patch.bind(this),
            this.unpatch.bind(this)
        );
        return module;
    }

    protected patch(moduleExports: typeof typeorm, moduleVersion: string) {
        this.moduleVersion = moduleVersion;
        if (moduleExports === undefined || moduleExports === null) {
            return moduleExports;
        }
        diag.debug(`applying patch to typeorm`);
        this.unpatch(moduleExports);
        this._wrap(moduleExports.ConnectionManager.prototype, 'create', this._createConnectionManagerPatch.bind(this));

        return moduleExports;
    }

    protected unpatch(moduleExports: typeof typeorm): void {
        if (isWrapped(moduleExports.ConnectionManager.prototype.create))
            this._unwrap(moduleExports.ConnectionManager.prototype, 'create');
    }

    private _createConnectionManagerPatch(original: (options: typeorm.ConnectionOptions) => typeorm.Connection) {
        const self = this;
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
                        self._getEntityManagerFunctionPatch(operation).bind(self)
                    );
            };

            functionsUsingEntityPersistExecutor.forEach(patch);
            functionsUsingQueryBuilder.forEach(patch);

            return connection;
        };
    }

    private _getEntityManagerFunctionPatch(opName: string) {
        const self = this;
        diag.debug(`typeorm instrumentation: patched EntityManager ${opName} prototype`);
        return function (original: Function) {
            return async function (...args: any[]) {
                const connectionOptions = this?.connection?.options ?? {};
                const attributes = {
                    [DatabaseAttribute.DB_SYSTEM]: connectionOptions.type,
                    [DatabaseAttribute.DB_USER]: connectionOptions.username,
                    // [GeneralAttribute.NET_PEER_IP]: '?',
                    [GeneralAttribute.NET_PEER_NAME]: connectionOptions.host,
                    [GeneralAttribute.NET_PEER_PORT]: connectionOptions.port,
                    // [GeneralAttribute.NET_TRANSPORT]: '?',
                    [DatabaseAttribute.DB_NAME]: connectionOptions.database,
                    [DatabaseAttribute.DB_OPERATION]: opName,
                    [DatabaseAttribute.DB_STATEMENT]: JSON.stringify(buildStatement(original, args)),
                    component: 'typeorm',
                };

                if (self._config.moduleVersionAttributeName) {
                    attributes[self._config.moduleVersionAttributeName] = self.moduleVersion;
                }

                Object.entries(attributes).forEach(([key, value]) => {
                    if (value === undefined) delete attributes[key];
                });

                const newSpan: Span = self.tracer.startSpan(`TypeORM ${opName}`, {
                    kind: SpanKind.CLIENT,
                    attributes,
                });

                try {
                    const response: Promise<any> = context.with(setSpan(context.active(), newSpan), () =>
                        original.apply(this, arguments)
                    );
                    const resolved = await response;
                    if (self._config?.responseHook) {
                        safeExecuteInTheMiddle(
                            () => self._config.responseHook(newSpan, resolved),
                            (e: Error) => {
                                if (e) diag.error('typeorm instrumentation: responseHook error', e);
                            },
                            true
                        );
                    }
                    return resolved;
                } catch (err) {
                    newSpan.setStatus({
                        code: SpanStatusCode.ERROR,
                        message: err.message,
                    });
                    throw err;
                } finally {
                    newSpan.end();
                }
            };
        };
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

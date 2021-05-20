import { context, setSpan, Span, SpanKind, SpanStatusCode, diag } from '@opentelemetry/api';
import {
    InstrumentationBase,
    InstrumentationNodeModuleFile,
    InstrumentationNodeModuleDefinition,
    isWrapped,
    safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import {
    SemanticAttributes,
    MessagingOperationValues,
    MessagingDestinationKindValues,
} from '@opentelemetry/semantic-conventions';
import { SocketIoInstrumentationConfig, Io, SocketIoInstrumentationAttributes } from './types';
import { VERSION } from './version';

const reservedEvents = ['connect', 'connect_error', 'disconnect', 'disconnecting', 'newListener', 'removeListener'];

export class SocketIoInstrumentation extends InstrumentationBase<Io> {
    protected _config!: SocketIoInstrumentationConfig;

    constructor(config: SocketIoInstrumentationConfig = {}) {
        super('opentelemetry-instrumentation-socket.io', VERSION, Object.assign({}, config));
    }
    setConfig(config: SocketIoInstrumentationConfig) {
        this._config = Object.assign({}, this._config, config);
    }
    protected init() {
        const socketInstrumentation = new InstrumentationNodeModuleFile<any>(
            'socket.io/dist/socket.js',
            ['>=3'],
            (moduleExports, moduleVersion) => {
                if (moduleExports === undefined || moduleExports === null) {
                    return moduleExports;
                }
                diag.debug(`applying patch to socket.io Socket`);
                if (isWrapped(moduleExports?.Socket?.prototype?.on)) {
                    this._unwrap(moduleExports.Socket.prototype, 'on');
                }
                this._wrap(moduleExports.Socket.prototype, 'on', this._patchOn(moduleVersion));
                return moduleExports;
            },
            (moduleExports) => {
                if (isWrapped(moduleExports?.Socket?.prototype?.on)) {
                    this._unwrap(moduleExports.Socket.prototype, 'on');
                }
                return moduleExports;
            }
        );

        const broadcastOperatorInstrumentation = new InstrumentationNodeModuleFile<any>(
            'socket.io/dist/broadcast-operator.js',
            ['>=4'],
            (moduleExports, moduleVersion) => {
                if (moduleExports === undefined || moduleExports === null) {
                    return moduleExports;
                }
                diag.debug(`applying patch to socket.io StrictEventEmitter`);
                if (isWrapped(moduleExports?.BroadcastOperator?.prototype?.emit)) {
                    this._unwrap(moduleExports.BroadcastOperator.prototype, 'emit');
                }
                this._wrap(moduleExports.BroadcastOperator.prototype, 'emit', this._patchEmit(moduleVersion));
                return moduleExports;
            },
            (moduleExports) => {
                if (isWrapped(moduleExports?.BroadcastOperator?.prototype?.emit)) {
                    this._unwrap(moduleExports.BroadcastOperator.prototype, 'emit');
                }
                return moduleExports;
            }
        );
        const namespaceInstrumentation = new InstrumentationNodeModuleFile<any>(
            'socket.io/dist/namespace.js',
            ['<4'],
            (moduleExports, moduleVersion) => {
                if (moduleExports === undefined || moduleExports === null) {
                    return moduleExports;
                }
                diag.debug(`applying patch to socket.io Namespace`);
                if (isWrapped(moduleExports?.Namespace?.prototype?.emit)) {
                    this._unwrap(moduleExports.Namespace.prototype, 'emit');
                }
                this._wrap(moduleExports.Namespace.prototype, 'emit', this._patchEmit(moduleVersion));
                return moduleExports;
            },
            (moduleExports) => {
                if (isWrapped(moduleExports?.Namespace?.prototype?.emit)) {
                    this._unwrap(moduleExports.Namespace.prototype, 'emit');
                }
            }
        );
        return new InstrumentationNodeModuleDefinition<Io>(
            'socket.io',
            ['>=3'],
            (moduleExports, moduleVersion) => {
                if (moduleExports === undefined || moduleExports === null) {
                    return moduleExports;
                }
                diag.debug(`applying patch to socket.io Server`);
                if (isWrapped(moduleExports?.Server?.prototype?.on)) {
                    this._unwrap(moduleExports.Server.prototype, 'on');
                }
                this._wrap(moduleExports.Server.prototype, 'on', this._patchOn(moduleVersion));
                return moduleExports;
            },
            (moduleExports, moduleVersion) => {
                if (isWrapped(moduleExports?.Server?.prototype?.on)) {
                    this._unwrap(moduleExports.Server.prototype, 'on');
                }
                return moduleExports;
            },
            [broadcastOperatorInstrumentation, namespaceInstrumentation, socketInstrumentation]
        );
    }

    private _patchOn(moduleVersion: string) {
        const self = this;
        return (original: Function) => {
            return function (ev: any, originalListener: Function) {
                if (!self._config.traceReserved && reservedEvents.includes(ev)) {
                    return original.apply(this, arguments);
                }
                const wrappedListener = function (...args: any[]) {
                    const operation = 'on';
                    const eventName = ev;

                    const span: Span = self.tracer.startSpan(`socket.io ${operation} ${eventName}`, {
                        kind: SpanKind.CONSUMER,
                        attributes: {
                            [SemanticAttributes.MESSAGING_SYSTEM]: 'socket.io',
                            [SemanticAttributes.MESSAGING_DESTINATION]: originalListener.name,
                            [SemanticAttributes.MESSAGING_OPERATION]: MessagingOperationValues.PROCESS,
                        },
                    });

                    if (self._config.onHook) {
                        safeExecuteInTheMiddle(
                            () => self._config.onHook(span, { moduleVersion, payload: args }),
                            (e) => {
                                if (e) diag.error(`socket.io instrumentation: onHook error`, e);
                            },
                            true
                        );
                    }
                    try {
                        return context.with(setSpan(context.active(), span), () =>
                            originalListener.apply(this, arguments)
                        );
                    } catch (error: any) {
                        span.setStatus({ message: error.message, code: SpanStatusCode.ERROR });
                        throw error;
                    } finally {
                        span.end();
                    }
                };
                return original.apply(this, [ev, wrappedListener]);
            };
        };
    }

    private _patchEmit(moduleVersion: string) {
        const self = this;
        return (original: Function) => {
            return function (ev: any, ...args: any[]) {
                if (!self._config.traceReserved && reservedEvents.includes(ev)) {
                    return original.apply(this, arguments);
                }
                const messagingSystem = 'socket.io';
                const operation = 'emit';
                const eventName = ev;
                const attributes: any = {
                    [SemanticAttributes.MESSAGING_SYSTEM]: messagingSystem,
                    [SemanticAttributes.MESSAGING_DESTINATION_KIND]: MessagingDestinationKindValues.TOPIC,
                };

                const rooms = this.rooms || this._rooms || this.sockets?._rooms;
                if (rooms && rooms.size > 0) {
                    attributes[SocketIoInstrumentationAttributes.SOCKET_IO_ROOMS] = Array.from<string>(rooms);
                }

                const namespace = this.name || this.adapter?.nsp?.name;
                if (namespace) {
                    attributes[SocketIoInstrumentationAttributes.SOCKET_IO_NAMESPACE] = namespace;
                }

                const span = self.tracer.startSpan(`${messagingSystem} ${operation} ${eventName}`, {
                    kind: SpanKind.PRODUCER,
                    attributes,
                });

                if (self._config.emitHook) {
                    safeExecuteInTheMiddle(
                        () => self._config.emitHook(span, { moduleVersion, payload: args }),
                        (e) => {
                            if (e) diag.error(`socket.io instrumentation: emitHook error`, e);
                        },
                        true
                    );
                }
                try {
                    return context.with(setSpan(context.active(), span), () => original.apply(this, arguments));
                } catch (error) {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
                    throw error;
                } finally {
                    span.end();
                }
            };
        };
    }
}

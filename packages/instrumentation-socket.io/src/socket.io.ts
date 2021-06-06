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
import {
    SocketIoInstrumentationConfig,
    Io,
    SocketIoInstrumentationAttributes,
    defaultSocketIoPath,
    HttpInstrumentationConfig,
} from './types';
import { VERSION } from './version';
import isPromise from 'is-promise';

const reservedEvents = ['connect', 'connect_error', 'disconnect', 'disconnecting', 'newListener', 'removeListener'];

export class SocketIoInstrumentation extends InstrumentationBase<Io> {
    protected _config!: SocketIoInstrumentationConfig;

    constructor(config: SocketIoInstrumentationConfig = {}) {
        super('opentelemetry-instrumentation-socket.io', VERSION, Object.assign({}, config));

        if (config.filterHttpTransport) {
            const httpInstrumentationConfig =
                config.filterHttpTransport.httpInstrumentation.getConfig() as HttpInstrumentationConfig;
            if (!Array.isArray(httpInstrumentationConfig.ignoreIncomingPaths)) {
                httpInstrumentationConfig.ignoreIncomingPaths = [];
            }
            httpInstrumentationConfig.ignoreIncomingPaths.push(
                config.filterHttpTransport.socketPath ?? defaultSocketIoPath
            );
            config.filterHttpTransport.httpInstrumentation.setConfig(httpInstrumentationConfig);
        }
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
                if (isWrapped(moduleExports?.Socket?.prototype?.emit)) {
                    this._unwrap(moduleExports.Socket.prototype, 'emit');
                }
                this._wrap(moduleExports.Socket.prototype, 'emit', this._patchEmit(moduleVersion));
                return moduleExports;
            },
            (moduleExports) => {
                if (isWrapped(moduleExports?.Socket?.prototype?.on)) {
                    this._unwrap(moduleExports.Socket.prototype, 'on');
                }
                if (isWrapped(moduleExports?.Socket?.prototype?.emit)) {
                    this._unwrap(moduleExports.Socket.prototype, 'emit');
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
                    const eventName = ev;
                    const defaultNamespace = '/';
                    const namespace = this.name || this.adapter?.nsp?.name;
                    const destination = namespace === defaultNamespace ? eventName : `${namespace} ${eventName}`;
                    const span: Span = self.tracer.startSpan(`${destination} ${MessagingOperationValues.RECEIVE}`, {
                        kind: SpanKind.CONSUMER,
                        attributes: {
                            [SemanticAttributes.MESSAGING_SYSTEM]: 'socket.io',
                            [SemanticAttributes.MESSAGING_DESTINATION]: namespace,
                            [SemanticAttributes.MESSAGING_OPERATION]: MessagingOperationValues.RECEIVE,
                            [SocketIoInstrumentationAttributes.SOCKET_IO_EVENT_NAME]: eventName,
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
                    return context.with(setSpan(context.active(), span), () =>
                        self.endSpan(() => originalListener.apply(this, arguments), span)
                    );
                };
                return original.apply(this, [ev, wrappedListener]);
            };
        };
    }

    private endSpan(traced: () => any | Promise<any>, span: Span) {
        try {
            const result = traced();
            if (isPromise(result)) {
                return Promise.resolve(result)
                    .catch((err) => {
                        if (err) {
                            if (typeof err === 'string') {
                                span.setStatus({ code: SpanStatusCode.ERROR, message: err });
                            } else {
                                span.recordException(err);
                                span.setStatus({ code: SpanStatusCode.ERROR, message: err?.message });
                            }
                        }
                        throw err;
                    })
                    .finally(() => span.end());
            } else {
                span.end();
                return result;
            }
        } catch (error: any) {
            span.recordException(error);
            span.setStatus({ code: SpanStatusCode.ERROR, message: error?.message });
            span.end();
            throw error;
        }
    }

    private _patchEmit(moduleVersion: string) {
        const self = this;
        return (original: Function) => {
            return function (ev: any, ...args: any[]) {
                if (!self._config.traceReserved && reservedEvents.includes(ev)) {
                    return original.apply(this, arguments);
                }
                const messagingSystem = 'socket.io';
                const eventName = ev;
                const attributes: any = {
                    [SemanticAttributes.MESSAGING_SYSTEM]: messagingSystem,
                    [SemanticAttributes.MESSAGING_DESTINATION_KIND]: MessagingDestinationKindValues.TOPIC,
                    [SocketIoInstrumentationAttributes.SOCKET_IO_EVENT_NAME]: eventName,
                };

                let rooms = this.rooms || this._rooms || this.sockets?._rooms;
                if (rooms?.size) {
                    attributes[SocketIoInstrumentationAttributes.SOCKET_IO_ROOMS] = rooms = Array.from<string>(rooms);
                }
                const namespace = this.name || this.adapter?.nsp?.name;
                if (namespace) {
                    attributes[SocketIoInstrumentationAttributes.SOCKET_IO_NAMESPACE] = namespace;
                    attributes[SemanticAttributes.MESSAGING_DESTINATION] = namespace;
                }
                const spanRooms = rooms.length ? `[${rooms.join()}]` : '';
                const span = self.tracer.startSpan(`${namespace}${spanRooms} send`, {
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

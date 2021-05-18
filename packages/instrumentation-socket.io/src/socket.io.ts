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
import { SocketIoInstrumentationConfig, Io } from './types';
import { VERSION } from './version';

const reservedEvents = ['connect', 'connect_error', 'disconnect', 'disconnecting', 'newListener', 'removeListener'];

export class SocketIoInstrumentation extends InstrumentationBase<Io> {
    protected _config!: SocketIoInstrumentationConfig;

    constructor(config: SocketIoInstrumentationConfig = {}) {
        super('opentelemetry-instrumentation-socket.io', VERSION, Object.assign({}, config));
        //WIP waiting for https://github.com/open-telemetry/opentelemetry-js/pull/2201 / https://github.com/open-telemetry/opentelemetry-js/issues/2174
        // if (config.filterTransport) {
        //     const httpInstrumentationConfig = config.filterTransport.httpInstrumentation.getConfig();
        //     httpInstrumentationConfig.ignoreIncomingPaths.push(config.filterTransport.socketPath);
        //     config.filterTransport.httpInstrumentation.setConfig(httpInstrumentationConfig);
        // }
    }
    protected init() {
        const socketInstrumentation = new InstrumentationNodeModuleFile<any>(
            'socket.io/dist/socket.js',
            ['>=3'],
            (moduleExports) => {
                if (moduleExports === undefined || moduleExports === null) {
                    return moduleExports;
                }
                diag.debug(`applying patch to socket.io Socket`);
                if (isWrapped(moduleExports?.Socket?.prototype?.on)) {
                    this._unwrap(moduleExports.Socket.prototype, 'on');
                }
                this._wrap(moduleExports.Socket.prototype, 'on', this._patchOn());
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
            (moduleExports) => {
                if (moduleExports === undefined || moduleExports === null) {
                    return moduleExports;
                }
                diag.debug(`applying patch to socket.io StrictEventEmitter`);
                if (isWrapped(moduleExports?.BroadcastOperator?.prototype?.emit)) {
                    this._unwrap(moduleExports.BroadcastOperator.prototype, 'emit');
                }
                this._wrap(moduleExports.BroadcastOperator.prototype, 'emit', this._patchEmit());
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
            (moduleExports) => {
                if (moduleExports === undefined || moduleExports === null) {
                    return moduleExports;
                }
                diag.debug(`applying patch to socket.io Namespace`);
                if (isWrapped(moduleExports?.Namespace?.prototype?.emit)) {
                    this._unwrap(moduleExports.Namespace.prototype, 'emit');
                }
                this._wrap(moduleExports.Namespace.prototype, 'emit', this._patchEmit());
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
                diag.debug(`applying patch to socket.io`);
                if (isWrapped(moduleExports.Server.prototype.emit)) {
                    this._unwrap(moduleExports.Server.prototype, 'emit');
                }
                this._wrap(moduleExports.Server.prototype, 'emit', this._patchEmit());
                if (isWrapped(moduleExports.Server.prototype.on)) {
                    this._unwrap(moduleExports.Server.prototype, 'on');
                }
                this._wrap(moduleExports.Server.prototype, 'on', this._patchOn());
                return moduleExports;
            },
            (moduleExports) => {
                if (isWrapped(moduleExports.Server.prototype.emit)) {
                    this._unwrap(moduleExports.Server.prototype, 'emit');
                }
                if (isWrapped(moduleExports.Server.prototype.on)) {
                    this._unwrap(moduleExports.Server.prototype, 'on');
                }
            },
            [broadcastOperatorInstrumentation, namespaceInstrumentation, socketInstrumentation]
        );
    }

    private _patchOn() {
        const self = this;
        return (original: Function) => {
            return function (ev: any, originalListener: Function) {
                if (!self._config.traceReserved && reservedEvents.includes(ev)) {
                    return original.apply(this, arguments);
                }
                const wrappedListener = function () {
                    const operation = 'on';
                    const messageName = ev;

                    const span: Span = self.tracer.startSpan(`socket.io ${operation} ${messageName}`, {
                        kind: SpanKind.CONSUMER,
                        attributes: {
                            [SemanticAttributes.MESSAGING_SYSTEM]: 'socket.io',
                            [SemanticAttributes.MESSAGING_DESTINATION]: originalListener.name,
                            [SemanticAttributes.MESSAGING_OPERATION]: MessagingOperationValues.PROCESS,
                        },
                    });

                    if (self._config.onHook) {
                        safeExecuteInTheMiddle(
                            () => self._config.onHook(span, arguments),
                            (e) => {
                                if (e) diag.error(`socket.io instrumentation: onHook error`, e);
                            },
                            true
                        );
                    }

                    const result = context.with(setSpan(context.active(), span), () =>
                        originalListener.apply(this, arguments)
                    );
                    span.end();
                    return result;
                };

                return original.apply(this, [ev, wrappedListener]);
            };
        };
    }

    private _patchEmit() {
        const self = this;
        return (original: Function) => {
            return function (ev: any, ...args: any[]) {
                if (!self._config.traceReserved && reservedEvents.includes(ev)) {
                    return original.apply(this, arguments);
                }
                const operation = 'emit';
                const messageName = ev;
                const attributes = {
                    [SemanticAttributes.MESSAGING_SYSTEM]: 'socket.io',
                    [SemanticAttributes.MESSAGING_DESTINATION_KIND]: 'topic',
                    [SemanticAttributes.MESSAGING_OPERATION]: operation,
                };

                const rooms = this.rooms || this._rooms || this.sockets._rooms;
                if (rooms && rooms.size > 0) {
                    attributes['socket.io.rooms'] = Array.from<string>(rooms).join();
                }

                if (this.name) {
                    attributes['socket.io.namespace'] = this.name;
                }

                const span = self.tracer.startSpan(`socket.io ${operation} ${messageName}`, {
                    kind: SpanKind.PRODUCER,
                    attributes,
                });

                if (self._config.emitHook) {
                    safeExecuteInTheMiddle(
                        () => self._config.emitHook(span, args),
                        (e) => {
                            if (e) diag.error(`socket.io instrumentation: emitHook error`, e);
                        },
                        true
                    );
                }
                const succuss = context.with(setSpan(context.active(), span), () => original.apply(this, arguments));
                if (!succuss) {
                    span.setStatus({
                        code: SpanStatusCode.ERROR,
                        message: '',
                    });
                }
                span.end();
                return succuss;
            };
        };
    }
}

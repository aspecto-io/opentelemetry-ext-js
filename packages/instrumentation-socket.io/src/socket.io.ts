import { context, setSpan, Span, SpanKind, SpanStatusCode, diag } from '@opentelemetry/api';
import {
    InstrumentationBase,
    InstrumentationNodeModuleFile,
    InstrumentationNodeModuleDefinition,
    isWrapped,
    safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
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
        const strictEventEmitterInstrumentation = new InstrumentationNodeModuleFile<any>(
            'socket.io/dist/typed-events.js',
            ['*'],
            (moduleExports) => {
                if (moduleExports === undefined || moduleExports === null) {
                    return moduleExports;
                }
                diag.debug(`applying patch to socket.io StrictEventEmitter`);
                if (isWrapped(moduleExports?.StrictEventEmitter?.prototype?.on)) {
                    this._unwrap(moduleExports.StrictEventEmitter.prototype, 'on');
                }
                this._wrap(moduleExports.StrictEventEmitter.prototype, 'on', this._patchOn());
                return moduleExports;
            },
            (moduleExports) => {
                if (isWrapped(moduleExports?.StrictEventEmitter?.prototype?.on)) {
                    this._unwrap(moduleExports.StrictEventEmitter.prototype, 'on');
                }
                return moduleExports;
            }
        );

        const broadcastOperatorInstrumentation = new InstrumentationNodeModuleFile<any>(
            'socket.io/dist/broadcast-operator.js',
            ['*'],
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

        const module = new InstrumentationNodeModuleDefinition<Io>(
            'socket.io',
            ['*'],
            (moduleExports) => {
                if (moduleExports === undefined || moduleExports === null) {
                    return moduleExports;
                }
                diag.debug(`applying patch to socket.io`);
                if (isWrapped(moduleExports.Server.prototype.emit)) {
                    this._unwrap(moduleExports.Server.prototype, 'emit');
                }
                this._wrap(moduleExports.Server.prototype, 'emit', this._patchEmit());
                if (isWrapped(moduleExports.Socket.prototype.emit)) {
                    this._unwrap(moduleExports.Socket.prototype, 'emit');
                }
                this._wrap(moduleExports.Socket.prototype, 'emit', this._patchEmit());
                if (isWrapped(moduleExports.Namespace.prototype.emit)) {
                    this._unwrap(moduleExports.Namespace.prototype, 'emit');
                }
                this._wrap(moduleExports.Namespace.prototype, 'emit', this._patchEmit());
                return moduleExports;
            },
            (moduleExports) => {
                if (isWrapped(moduleExports.Server.prototype.emit)) {
                    this._unwrap(moduleExports.Server.prototype, 'emit');
                }
                if (isWrapped(moduleExports.Socket.prototype.emit)) {
                    this._unwrap(moduleExports.Socket.prototype, 'emit');
                }
                if (isWrapped(moduleExports.Namespace.prototype.emit)) {
                    this._unwrap(moduleExports.Namespace.prototype, 'emit');
                }
            },
            [strictEventEmitterInstrumentation, broadcastOperatorInstrumentation]
        );
        return module;
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

                    const attributes = {
                        [SemanticAttributes.MESSAGING_SYSTEM]: 'socket.io',
                        [SemanticAttributes.MESSAGING_DESTINATION]: originalListener.name,
                        [SemanticAttributes.MESSAGING_OPERATION]: operation,
                    };
                    const span: Span = self.tracer.startSpan(`socket.io ${operation} ${messageName}`, {
                        kind: SpanKind.PRODUCER,
                        attributes,
                    });

                    if (self._config.onHook) {
                        safeExecuteInTheMiddle(
                            () => self._config.onHook(span, arguments),
                            (e) => {
                                if (e) diag.error(`opentelemetry.socket.io instrumentation: OnHook error`, e);
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
            return function (ev: any, ...args: any[]): boolean {
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

                if (this.rooms && this.rooms.size > 0) {
                    const rooms = Array.from<string>(this.rooms);
                    attributes['rooms'] = rooms.join();
                }

                if (this.name) {
                    attributes['namespace'] = this.name;
                }

                const span = self.tracer.startSpan(`socket.io ${operation} ${messageName}`, {
                    kind: SpanKind.PRODUCER,
                    attributes,
                });

                if (self._config.emitHook) {
                    safeExecuteInTheMiddle(
                        () => self._config.emitHook(span, args),
                        (e) => {
                            if (e) diag.error(`opentelemetry.socket.io instrumentation: emitHook error`, e);
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

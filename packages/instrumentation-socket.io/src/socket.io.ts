import {
    context,
    setSpan,
    Span,
    SpanKind,
    SpanStatusCode,
    getSpan,
    diag,
    suppressInstrumentation,
} from '@opentelemetry/api';
import {
    InstrumentationBase,
    InstrumentationNodeModuleFile,
    InstrumentationModuleDefinition,
    InstrumentationNodeModuleDefinition,
    isWrapped,
} from '@opentelemetry/instrumentation';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import io from 'socket.io';
import { SocketIoInstrumentationConfig } from './types';
import { VERSION } from './version';

export class SocketIoInstrumentation extends InstrumentationBase<typeof io> {
    static readonly component = 'socket.io';
    protected _config!: SocketIoInstrumentationConfig;
    private moduleVersion: string;

    constructor(config: SocketIoInstrumentationConfig = {}) {
        super('opentelemetry-instrumentation-socket.io', VERSION, Object.assign({}, config));
    }
    protected init(): InstrumentationModuleDefinition<typeof io> {
        const strictEventEmitterInstrumentation = new InstrumentationNodeModuleFile<any>(
            'socket.io/dist/typed-events.js',
            ['*'],
            this.patchStrictEventEmitter.bind(this),
            this.unpatchStrictEventEmitter.bind(this)
        );

        const broadcastOperatorInstrumentation = new InstrumentationNodeModuleFile<any>(
            'socket.io/dist/broadcast-operator.js',
            ['*'],
            this.patchBroadcastOperator.bind(this),
            this.unpatchBroadcastOperator.bind(this)
        );

        const module = new InstrumentationNodeModuleDefinition<typeof io>(
            SocketIoInstrumentation.component,
            ['*'],
            this.patch.bind(this),
            this.unpatch.bind(this),
            [strictEventEmitterInstrumentation, broadcastOperatorInstrumentation]
        );
        return module;
    }

    protected patchStrictEventEmitter(moduleExports: any) {
        if (moduleExports === undefined || moduleExports === null) {
            return moduleExports;
        }
        diag.debug(`applying patch to socket.io StrictEventEmitter`);
        this.unpatchStrictEventEmitter(moduleExports);
        this._wrap(moduleExports.StrictEventEmitter.prototype, 'on', this._createOnPatch.bind(this));
        return moduleExports;
    }

    protected unpatchStrictEventEmitter(moduleExports: any) {
        if (isWrapped(moduleExports?.StrictEventEmitter?.prototype?.on)) {
            this._unwrap(moduleExports.StrictEventEmitter.prototype, 'on');
        }
        return moduleExports;
    }

    protected patchBroadcastOperator(moduleExports: any) {
        if (moduleExports === undefined || moduleExports === null) {
            return moduleExports;
        }
        diag.debug(`applying patch to socket.io StrictEventEmitter`);
        this.unpatchBroadcastOperator(moduleExports);
        this._wrap(moduleExports.BroadcastOperator.prototype, 'emit', this._createEmitPatch.bind(this));
        return moduleExports;
    }

    protected unpatchBroadcastOperator(moduleExports: any) {
        if (isWrapped(moduleExports?.BroadcastOperator?.prototype?.emit)) {
            this._unwrap(moduleExports.BroadcastOperator.prototype, 'emit');
        }
        return moduleExports;
    }

    protected patch(moduleExports: typeof io, moduleVersion: string) {
        this.moduleVersion = moduleVersion;
        if (moduleExports === undefined || moduleExports === null) {
            return moduleExports;
        }
        diag.debug(`applying patch to socket.io`);
        this.unpatch(moduleExports);
        this._wrap(moduleExports.Server.prototype, 'emit', this._createEmitPatch.bind(this));
        this._wrap(moduleExports.Socket.prototype, 'emit', this._createEmitPatch.bind(this));
        this._wrap(moduleExports.Namespace.prototype, 'emit', this._createEmitPatch.bind(this));
        return moduleExports;
    }

    protected unpatch(moduleExports: typeof io): void {
        if (isWrapped(moduleExports.Server.prototype.emit)) {
            this._unwrap(moduleExports.Server.prototype, 'emit');
        }
        if (isWrapped(moduleExports.Socket.prototype.emit)) {
            this._unwrap(moduleExports.Socket.prototype, 'emit');
        }
        if (isWrapped(moduleExports.Namespace.prototype.emit)) {
            this._unwrap(moduleExports.Namespace.prototype, 'emit');
        }
    }

    private _createOnPatch(original: Function) {
        const self = this;
        return function (ev: any, originalListener: Function) {
            const wrappedListener = function () {
                const operation = 'on';
                const messageName = ev;

                const attributes = {
                    [SemanticAttributes.MESSAGING_SYSTEM]: 'socket.io',
                    [SemanticAttributes.MESSAGING_DESTINATION]: originalListener.name,
                    [SemanticAttributes.MESSAGING_OPERATION]: operation,
                };
                const newSpan: Span = self.tracer.startSpan(`socket.io ${operation} ${messageName}`, {
                    kind: SpanKind.PRODUCER,
                    attributes,
                });
                const result = context.with(setSpan(context.active(), newSpan), () =>
                    originalListener.apply(this, arguments)
                );
                newSpan.end();
                return result;
            };

            return original.apply(this, [ev, wrappedListener]);
        };
    }

    private _createEmitPatch(original: Function) {
        const self = this;
        return function (ev: any, ...args: any[]): boolean {
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

            const newSpan: Span = self.tracer.startSpan(`socket.io ${operation} ${messageName}`, {
                kind: SpanKind.PRODUCER,
                attributes,
            });

            const succuss = context.with(setSpan(context.active(), newSpan), () => original.apply(this, arguments));
            if (!succuss) {
                newSpan.setStatus({
                    code: SpanStatusCode.ERROR,
                    message: '',
                });
            }
            newSpan.end();
            return succuss;
        };
    }
}

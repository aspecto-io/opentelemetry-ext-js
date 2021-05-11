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
        const module = new InstrumentationNodeModuleDefinition<typeof io>(
            SocketIoInstrumentation.component,
            ['*'],
            this.patch.bind(this),
            this.unpatch.bind(this)
        );
        return module;
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

    private _createEmitPatch(original: Function) {
        const self = this;
        return function (ev: any, args: any) {
            const operation = `emit ${ev}`;
            const attributes = {
                [SemanticAttributes.MESSAGING_SYSTEM]: 'socket.io',
                [SemanticAttributes.MESSAGING_DESTINATION]: "string",
                [SemanticAttributes.MESSAGING_DESTINATION_KIND]: "topic",
                [SemanticAttributes.MESSAGING_OPERATION]: operation,
                component: 'socket.io',
            };

            const newSpan: Span = self.tracer.startSpan(`socket.io ${operation}`, {
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

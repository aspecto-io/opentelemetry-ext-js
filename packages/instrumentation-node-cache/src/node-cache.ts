import type * as NodeCache from 'node-cache';
import {
    InstrumentationBase,
    InstrumentationModuleDefinition,
    InstrumentationNodeModuleDefinition,
} from '@opentelemetry/instrumentation';
import { NodeCacheInstrumentationConfig } from './types';
import { VERSION } from './version';
import { diag, SpanKind, SpanStatusCode, context, trace } from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';

type NodeCacheType = typeof NodeCache;

export class NodeCacheInstrumentation extends InstrumentationBase<NodeCacheType> {
    constructor(protected override _config: NodeCacheInstrumentationConfig = {}) {
        super('opentelemetry-instrumentation-node-cache', VERSION, _config);
    }

    override setConfig(config: NodeCacheInstrumentationConfig = {}) {
        this._config = config;
    }

    protected init(): InstrumentationModuleDefinition<NodeCacheType> {
        const module = new InstrumentationNodeModuleDefinition<NodeCacheType>(
            'node-cache',
            ['*'],
            this.patch.bind(this),
            (moduleExports) => moduleExports
        );
        return module;
    }

    private patch(moduleExports: NodeCacheType, moduleVersion: string) {
        const self = this;
        const origConstructor = moduleExports as unknown as Function;
        const origPrototype = moduleExports.prototype;

        function PatchedNodeCache(options = {}) {
            const inst: NodeCache = new (origConstructor as any)(options);
            ['get', 'take', 'del', 'getTtl', 'has', 'set', 'mget'].forEach((op) =>
                self._wrap(
                    inst,
                    op as keyof NodeCache,
                    self.patchClassFunction(op, (args: any[]) => `${op} ${args[0]}`).bind(self)
                )
            );
            return inst;
        }
        PatchedNodeCache.prototype = origPrototype;
        PatchedNodeCache.version = (moduleExports as any).version;
        return PatchedNodeCache;
    }

    private patchClassFunction(opName: string, toStatement: (...args: any[]) => string) {
        const self = this;
        return (originalFunc: Function) => {
            return function func() {
                if (self._config.requireParentSpan && trace.getSpan(context.active()) === undefined) {
                    return originalFunc.apply(this, arguments);
                }

                const span = self.tracer.startSpan(`node-cache ${opName}`, {
                    kind: SpanKind.INTERNAL,
                    attributes: {
                        [SemanticAttributes.DB_SYSTEM]: 'node-cache',
                        [SemanticAttributes.DB_OPERATION]: opName,
                        [SemanticAttributes.DB_STATEMENT]: toStatement(arguments),
                    },
                });

                try {
                    // Some operations, like "take", use other operation under the hood
                    // We're only interested in the top level operation, so we use "suppressTracing"
                    const response = context.with(suppressTracing(context.active()), () =>
                        originalFunc.apply(this, arguments)
                    );
                    if (self._config.responseHook) {
                        try {
                            self._config.responseHook(span, response);
                        } catch (err) {
                            diag.error('node-cache instrumentation: responseHook error', err);
                        }
                    }
                    return response;
                } catch (err) {
                    span.recordException(err);
                    span.setStatus({
                        code: SpanStatusCode.ERROR,
                        message: err.message,
                    });
                    throw err;
                } finally {
                    span.end();
                }
            };
        };
    }
}

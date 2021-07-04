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
            ['>=5.0.0'],
            this.patch.bind(this)
        );
        return module;
    }

    private patch(moduleExports: NodeCacheType, moduleVersion: string) {
        const self = this;
        const origConstructor = moduleExports as unknown as Function;
        const origPrototype = moduleExports.prototype;

        function PatchedNodeCache(options = {}) {
            const inst: NodeCache = new (origConstructor as any)(options);
            ['get', 'take', 'del', 'getTtl', 'has', 'set', 'mget', 'flushAll'].forEach((op) =>
                self._wrap(
                    inst,
                    op as keyof NodeCache,
                    self
                        .patchClassFunction(
                            op,
                            (args: any[]) => `${op} ${args[0] ? args[0] : ''}`.trim(),
                            moduleVersion
                        )
                        .bind(self)
                )
            );
            self._wrap(
                inst,
                'mset',
                self
                    .patchClassFunction(
                        'mset',
                        (args: any[]) => `mset ${args[0].map((entry: NodeCache.ValueSetItem) => entry.key).join(',')}`,
                        moduleVersion
                    )
                    .bind(self)
            );
            self._wrap(
                inst,
                'ttl',
                self.patchClassFunction('ttl', (args: any[]) => `ttl ${args[0]} ${args[1]}`, moduleVersion).bind(self)
            );
            return inst;
        }
        PatchedNodeCache.prototype = origPrototype;
        PatchedNodeCache.version = (moduleExports as any).version;
        return PatchedNodeCache;
    }

    private patchClassFunction(opName: string, toStatement: (...args: any[]) => string, moduleVersion: string) {
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

                if (self._config.requestHook) {
                    try {
                        self._config.requestHook(span, {
                            moduleVersion,
                            operation: opName,
                            args: Object.values(arguments),
                        });
                    } catch (err) {
                        diag.error('node-cache instrumentation: requestHook error', err);
                    }
                }

                try {
                    // Some operations, like "take", use other operation under the hood
                    // We're only interested in the top level operation, so we use "suppressTracing"
                    const response = context.with(suppressTracing(context.active()), () =>
                        originalFunc.apply(this, arguments)
                    );
                    if (self._config.responseHook) {
                        try {
                            self._config.responseHook(span, { operation: opName, response });
                        } catch (err) {
                            diag.error('node-cache instrumentation: responseHook error', err);
                        }
                    }
                    return response;
                } catch (err) {
                    span.recordException(err);
                    span.setStatus({
                        code: SpanStatusCode.ERROR,
                        message: typeof err === 'string' ? err : err?.message,
                    });
                    throw err;
                } finally {
                    span.end();
                }
            };
        };
    }
}

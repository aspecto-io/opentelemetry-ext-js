import { getRPCMetadata } from '@opentelemetry/core';
import { SpanKind, diag, context } from '@opentelemetry/api';
import {
    LayerPath,
    ExpressLayer,
    PatchedRequest,
    PATH_STORE,
    REQ_SPAN,
    EXCEPTION_RECORDED,
    ExpressInstrumentationConfig,
    CONSUMED_ROUTE_STATE,
    ExpressConsumedRouteState,
} from './types';
import { VERSION } from './version';
import {
    InstrumentationBase,
    InstrumentationModuleDefinition,
    InstrumentationNodeModuleDefinition,
    InstrumentationNodeModuleFile,
    safeExecuteInTheMiddle,
    isWrapped,
} from '@opentelemetry/instrumentation';
import type express from 'express';
import {
    getRouteAttributes,
    getHttpSpanAttributeFromRes,
    getHttpSpanAttributesFromReq,
    getSpanInitialName,
    getSpanNameOnResEnd,
    parseResponseStatus,
} from './utils/attributes';
import { consumeLayerPathAndUpdateState, createInitialRouteState } from './utils/route-context';
import { getLayerPathFromFirstArg } from './utils/layer-path';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';

const originalLayerStore = Symbol('otel.express-plugins.orig-layer-export');

export class ExpressInstrumentation extends InstrumentationBase<typeof express> {
    static readonly supportedVersions = ['^4.9.0'];
    protected override _config: ExpressInstrumentationConfig;

    constructor(config: ExpressInstrumentationConfig = {}) {
        super('opentelemetry-instrumentation-express', VERSION, Object.assign({}, config));
    }

    override setConfig(config: ExpressInstrumentationConfig = {}) {
        this._config = Object.assign({}, config);
    }

    protected init(): InstrumentationModuleDefinition<typeof express> {
        const layerModule = new InstrumentationNodeModuleFile<ExpressLayer>(
            'express/lib/router/layer.js',
            ExpressInstrumentation.supportedVersions,
            this._patchExpressLayer.bind(this),
            this._unpatchExpressLayer.bind(this)
        );

        const module = new InstrumentationNodeModuleDefinition<typeof express>(
            'express',
            ExpressInstrumentation.supportedVersions,
            this.patch.bind(this),
            this.unpatch.bind(this),
            [layerModule]
        );

        return module;
    }

    protected patch(moduleExports: typeof express, moduleVersion?: string) {
        if (moduleExports === undefined || moduleExports === null) {
            return moduleExports;
        }
        diag.debug('opentelemetry.express instrumentation: patching express application lazyrouter');

        // convert to any so we don't get errors because lazyrouter is not public
        const application = moduleExports?.application as any;
        if (isWrapped(application?.lazyrouter)) {
            this._unwrap(application, 'lazyrouter');
        }
        this._wrap(application, 'lazyrouter', this.getApplicationLazyRouterPatch.bind(this, moduleVersion));

        return moduleExports;
    }

    protected unpatch(moduleExports: typeof express): void {
        diag.debug('opentelemetry.express instrumentation: unpatching Express application lazyrouter');
        this._unwrap(moduleExports?.application as any, 'lazyrouter');
    }

    private _patchExpressLayer(moduleExports: ExpressLayer, version: string) {
        const self = this;
        if (moduleExports === undefined || moduleExports === null) {
            return moduleExports;
        }
        const origLayerConstructor = moduleExports as unknown as Function;
        const LayerPrototype = moduleExports.prototype;

        diag.debug('opentelemetry.express instrumentation: patching Express Layer handle_request and handle_error');
        this._wrap(LayerPrototype, 'handle_request', this._getLayerHandleRequestPatch.bind(this));
        this._wrap(LayerPrototype, 'handle_error', this._getLayerHandleErrorPatch.bind(this));

        // patch the Layer constructor to collect the 'path'
        function OtelPatchedLayer(path, options, fn) {
            if (!(this instanceof OtelPatchedLayer)) {
                return new (OtelPatchedLayer as any)(path, options, fn);
            }
            this[PATH_STORE] = getLayerPathFromFirstArg(path, options ?? {});
            return origLayerConstructor.call(this, path, options, fn);
        }
        OtelPatchedLayer.prototype = LayerPrototype;
        OtelPatchedLayer[originalLayerStore] = moduleExports;

        return OtelPatchedLayer;
    }

    private _unpatchExpressLayer(moduleExports: ExpressLayer) {
        diag.debug('opentelemetry.express instrumentation: unpatching Express Layer');
        const originalLayerExport = moduleExports[originalLayerStore] ?? moduleExports;
        if (isWrapped(originalLayerExport.prototype.handle_request)) {
            this._unwrap(originalLayerExport.prototype, 'handle_request');
        }
        if (isWrapped(originalLayerExport.prototype.handle_error)) {
            this._unwrap(originalLayerExport.prototype, 'handle_error');
        }
        return originalLayerExport;
    }

    private _getLayerHandleRequestPatch(original: express.RequestHandler) {
        const self = this;
        return function (this: ExpressLayer, req: PatchedRequest, res: express.Response, next: express.NextFunction) {
            // this is what express is doing to check if layer should be invoke
            if (this.handle.length > 3) {
                return original.apply(this, arguments);
            }

            const { origState, newState } = self.getRoutingStateOnConsumingPath(req, this);

            const pluginNext: express.NextFunction = function errorHandlingNext(err?: any): any {
                if (err && err !== 'route' && err !== 'router') {
                    self._recordException(req, err);
                }
                self.runMiddlewareWithContext(origState, req, () => next(err));
            };
            return self.runMiddlewareWithContext(newState, req, () => original.call(this, req, res, pluginNext));
        };
    }

    private _getLayerHandleErrorPatch(original: express.ErrorRequestHandler) {
        const self = this;
        return function (
            this: ExpressLayer,
            err: any,
            req: PatchedRequest,
            res: express.Response,
            next: express.NextFunction
        ) {
            // this is what express is doing to check if layer should be invoke
            if (this.handle.length !== 4) {
                return original.apply(this, arguments);
            }

            const { origState, newState } = self.getRoutingStateOnConsumingPath(req, this);

            const pluginNext: express.NextFunction = function errorHandlingNext(err?: any): any {
                if (err !== 'route' && err !== 'router') {
                    self._recordException(req, err);
                }
                self.runMiddlewareWithContext(origState, req, () => next(err));
            };
            return self.runMiddlewareWithContext(newState, req, () => original.call(this, err, req, res, pluginNext));
        };
    }

    private _recordException(req: PatchedRequest, err: Error) {
        try {
            if (!err || err[EXCEPTION_RECORDED]) {
                return;
            }

            const span = req[REQ_SPAN];
            if (!span) {
                return;
            }
            span.recordException(err);
            // mark as recorded to avoid duplicates
            Object.defineProperty(err, EXCEPTION_RECORDED, {
                enumerable: false,
                value: true,
            });
        } catch {}
    }

    private registerInstrumentationMiddleware(app: express.Application, moduleVersion?: string) {
        const plugin = this;
        app.use((req: PatchedRequest, res: express.Response, next: express.NextFunction) => {
            // check if this app was mounted in another express app.
            // we want the logic to run just once per request
            if (req.hasOwnProperty(REQ_SPAN)) {
                next();
                return;
            }

            const spanName = getSpanInitialName(req);
            const span = plugin.tracer.startSpan(spanName, {
                kind: SpanKind.INTERNAL,
                attributes: plugin._config.includeHttpAttributes ? getHttpSpanAttributesFromReq(req) : {},
            });

            if (plugin._config.requestHook) {
                safeExecuteInTheMiddle(
                    () => plugin._config.requestHook(span, { moduleVersion, req, res }),
                    (e) => {
                        if (e) diag.error(`opentelemetry.express instrumentation: requestHook error`, e);
                    },
                    true
                );
            }

            Object.defineProperty(req, REQ_SPAN, {
                enumerable: false,
                value: span,
            });

            const oldResEnd = res.end;

            res.end = function () {
                const routeState = plugin.getCurrentRouteState(req);
                const routeAttributes = getRouteAttributes(routeState);
                const route = routeAttributes[SemanticAttributes.HTTP_ROUTE] as string;
                if (route) {
                    const rpcMetadata = getRPCMetadata(context.active());
                    if (rpcMetadata) {
                        rpcMetadata.route = route;
                    }
                }

                const origRes = oldResEnd.apply(res, arguments);

                span.setAttributes(routeAttributes);
                if (plugin._config.includeHttpAttributes) {
                    span.setAttributes(getHttpSpanAttributeFromRes(res));
                }
                span.setStatus(parseResponseStatus(res.statusCode!));

                const newSpanName = getSpanNameOnResEnd(req, routeState);
                if (newSpanName) {
                    span.updateName(newSpanName);
                }

                span.end();

                return origRes;
            };

            next();
        });
    }

    private getApplicationLazyRouterPatch(moduleVersion: string, original: () => void) {
        const self = this;
        return function patchedLazyRouter() {
            const origRes = original.apply(this, arguments);
            if (!isWrapped(this._router.handle)) {
                self._wrap(this._router, 'handle', self.getAppRouterHandlerPatch.bind(self));
                self.registerInstrumentationMiddleware(this, moduleVersion);
            }
            return origRes;
        };
    }

    private getAppRouterHandlerPatch(
        original: (req: express.Request, res: express.Response, next: express.NextFunction) => void
    ) {
        const self = this;
        return function patchedAppRouterHandle(
            req: express.Request,
            res: express.Response,
            next: express.NextFunction
        ) {
            // check that this is indeed the entry point to the app
            // we will hit this if on mounted app cases
            const currentState = self.getCurrentRouteState(req);
            if (currentState) {
                return original.apply(this, arguments);
            }

            const initialState: ExpressConsumedRouteState = createInitialRouteState(req);
            const patchedNext = function (err?: any) {
                return self.runMiddlewareWithContext({ ...initialState, isUnhandled: true }, req, () => next(err));
            };
            return self.runMiddlewareWithContext(initialState, req, () => original.call(this, req, res, patchedNext));
        };
    }

    private getRoutingStateOnConsumingPath(
        req: express.Request,
        layer: ExpressLayer
    ): { origState: ExpressConsumedRouteState; newState: ExpressConsumedRouteState } {
        const origContext = context.active();
        const currentState = this.getCurrentRouteState(req);

        // we must have an express context at this point (which was create at app router)
        // if we don't, than this is an error
        if (!currentState) {
            const errorState = {
                errors: ['internal error in express instrumentation: missing route context'],
            };
            return { origState: errorState, newState: errorState };
        }
        const currentLayerPath: LayerPath = layer[PATH_STORE];
        const newExpressRouteState = consumeLayerPathAndUpdateState(currentState, req, currentLayerPath);
        return { origState: currentState, newState: newExpressRouteState };
    }

    // we would like to rely on otel context which propagate correctly via async calls.
    // the issue is that sometimes this mechanism fails due to timers / event emitters / thenables etc.
    // then we get just an empty context which we cannot extract route from.
    // so we install a fallback which should cover most cases - save the route state on the request as well,
    // and restore it when the middleware is done
    private runMiddlewareWithContext(
        consumeRouteState: ExpressConsumedRouteState,
        req: PatchedRequest,
        fn: (...args: unknown[]) => unknown
    ) {
        Object.defineProperty(req, CONSUMED_ROUTE_STATE, {
            value: consumeRouteState,
            enumerable: false,
            configurable: true,
        });
        const middlewareResult = context.with(context.active().setValue(CONSUMED_ROUTE_STATE, consumeRouteState), fn);
        return middlewareResult;
    }

    private getCurrentRouteState(req: PatchedRequest): ExpressConsumedRouteState {
        return (
            (context.active().getValue(CONSUMED_ROUTE_STATE) as ExpressConsumedRouteState) ?? req[CONSUMED_ROUTE_STATE]
        );
    }
}

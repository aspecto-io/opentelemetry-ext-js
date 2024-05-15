import { SpanAttributes, SpanStatus, SpanStatusCode } from '@opentelemetry/api';
import { SEMATTRS_HTTP_FLAVOR, SEMATTRS_HTTP_HOST, SEMATTRS_HTTP_METHOD, SEMATTRS_HTTP_ROUTE, SEMATTRS_HTTP_SCHEME, SEMATTRS_HTTP_STATUS_CODE, SEMATTRS_HTTP_TARGET, SEMATTRS_NET_PEER_IP, SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { ExpressConsumedRouteState, ExpressInstrumentationAttributes } from '../types';
import type express from 'express';

export const getRouteAttributes = (routeState: ExpressConsumedRouteState): SpanAttributes => {
    const attributes: SpanAttributes = {};

    const resolvedRoute = getResolvedRoute(routeState);
    if (resolvedRoute != null) {
        attributes[SEMATTRS_HTTP_ROUTE] = resolvedRoute;
    }

    const fullRoute = getFullRoute(routeState);
    if (fullRoute) {
        attributes[ExpressInstrumentationAttributes.EXPRESS_ROUTE_FULL] = fullRoute;
    }

    const configuredRoute = getConfiguredRoute(routeState);
    if (configuredRoute != null) {
        attributes[ExpressInstrumentationAttributes.EXPRESS_ROUTE_CONFIGURED] = configuredRoute;
    }

    if (typeof routeState?.params === 'object') {
        attributes[ExpressInstrumentationAttributes.EXPRESS_ROUTE_PARAMS] = JSON.stringify(routeState.params);
    }

    if (routeState?.isUnhandled) {
        attributes[ExpressInstrumentationAttributes.EXPRESS_UNHANDLED] = true;
    }

    if (routeState?.errors) {
        attributes[ExpressInstrumentationAttributes.EXPRESS_INSTRUMENTATION_ERRORS] = JSON.stringify(routeState.errors);
    }

    return attributes;
};

// might contain data with high cardinality, such as ids etc.
// this might happen on early termination due to authorization middlewares etc.
export const getFullRoute = (expressRoutState: ExpressConsumedRouteState): string => {
    // exit when missing
    if (!expressRoutState) return;

    // exit when missing
    if (expressRoutState.resolvedRoute == null || expressRoutState.remainingRoute == null) return;

    return expressRoutState.resolvedRoute + expressRoutState.remainingRoute;
};

const getConfiguredRoute = (expressRoutState: ExpressConsumedRouteState): string => expressRoutState?.configuredRoute;

export const getResolvedRoute = (expressRoutContext: ExpressConsumedRouteState): string =>
    expressRoutContext?.resolvedRoute;

export const getHttpSpanAttributeFromRes = (res: express.Response): SpanAttributes => {
    return {
        [SEMATTRS_HTTP_STATUS_CODE]: res.statusCode,
    };
};

export const getSpanNameOnResEnd = (req: express.Request, routeState: ExpressConsumedRouteState): string => {
    // route.path will give use
    const method = req?.method?.toUpperCase();
    const route = getResolvedRoute(routeState);
    if (!method || !route) return undefined;
    return `${method} ${route}`;
};

export const getSpanInitialName = (req: express.Request): string => {
    return `${req?.method?.toUpperCase() ?? ''} ${req?.path ?? ''}`;
};

export const createHostAttribute = (req: express.Request): string => {
    // prefer to use host from incoming headers
    const hostHeader = req.headers?.host;
    if (hostHeader) return hostHeader;

    // if not available, construct it from parts
    const hostname = req.hostname ?? 'localhost';
    return hostname;
};

export const getHttpSpanAttributesFromReq = (req: express.Request): SpanAttributes => {
    return {
        [SEMATTRS_HTTP_METHOD]: req.method.toUpperCase(),
        [SEMATTRS_HTTP_TARGET]: req.originalUrl,
        [SEMATTRS_HTTP_FLAVOR]: req.httpVersion,
        [SEMATTRS_HTTP_HOST]: createHostAttribute(req),
        [SEMATTRS_HTTP_SCHEME]: req.protocol,
        [SEMATTRS_NET_PEER_IP]: req.ip,
    };
};

// from @opentelemetry/instrumentation-http
// https://github.com/open-telemetry/opentelemetry-js/blob/main/packages/opentelemetry-instrumentation-http/src/utils.ts#L70
export const parseResponseStatus = (statusCode: number): Omit<SpanStatus, 'message'> => {
    // 1xx, 2xx, 3xx are OK
    if (statusCode >= 100 && statusCode < 400) {
        return { code: SpanStatusCode.OK };
    }

    // All other codes are error
    return { code: SpanStatusCode.ERROR };
};

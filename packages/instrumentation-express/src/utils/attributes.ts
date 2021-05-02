import { SpanAttributes } from '@opentelemetry/api';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { ExpressConsumedRouteState, ExpressInstrumentationAttributes } from '../types';
import type express from 'express';

export const getRouteAttributes = (routeState: ExpressConsumedRouteState): SpanAttributes => {
    const attributes: SpanAttributes = {};

    const resolvedRoute = getResolvedRoute(routeState);
    if (resolvedRoute != null) {
        attributes[SemanticAttributes.HTTP_ROUTE] = resolvedRoute;
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

export const getSpanAttributeFromRes = (res: express.Response): SpanAttributes => {
    return {
        [SemanticAttributes.HTTP_STATUS_CODE]: res.statusCode,
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

export const getSpanAttributesFromReq = (req: express.Request): SpanAttributes => {
    return {
        [SemanticAttributes.HTTP_METHOD]: req.method.toUpperCase(),
        [SemanticAttributes.HTTP_TARGET]: req.originalUrl,
        [SemanticAttributes.HTTP_FLAVOR]: req.httpVersion,
        [SemanticAttributes.HTTP_HOST]: createHostAttribute(req),
        [SemanticAttributes.HTTP_SCHEME]: req.protocol,
        [SemanticAttributes.NET_PEER_IP]: req.ip,
    };
};

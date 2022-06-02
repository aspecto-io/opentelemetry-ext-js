import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import expect from 'expect';
import { ExpressInstrumentationAttributes } from '../src/types';
import type express from 'express';
import { getTestSpans } from '@opentelemetry/contrib-test-utils';

export interface expectRouteAttributesAdvancedOptions {
    expectedParams?: Record<string, string>;
    configuredRoute?: string;
}

export const expectRouteAttributes = (
    span: ReadableSpan,
    expectedRoute: string,
    expectedFullRoute: string,
    options?: expectRouteAttributesAdvancedOptions
) => {
    const { expectedParams, configuredRoute } = options ?? {};
    expect(span.attributes[SemanticAttributes.HTTP_ROUTE]).toEqual(expectedRoute);
    expect(span.attributes[ExpressInstrumentationAttributes.EXPRESS_ROUTE_FULL]).toEqual(expectedFullRoute);
    const actualParams = JSON.parse(span.attributes[ExpressInstrumentationAttributes.EXPRESS_ROUTE_PARAMS] as string);
    expect(actualParams).toStrictEqual(expectedParams ?? {});
    expect(span.attributes[ExpressInstrumentationAttributes.EXPRESS_ROUTE_CONFIGURED]).toEqual(
        configuredRoute ?? expectedRoute
    );
    expect(span.attributes[ExpressInstrumentationAttributes.EXPRESS_INSTRUMENTATION_ERRORS]).toBeUndefined();
    expect(span.attributes[ExpressInstrumentationAttributes.EXPRESS_UNHANDLED]).toBeUndefined();
};

export const expectRouteFromFinalHandler = (span: ReadableSpan, fullRoute: string) => {
    expect(span.attributes[SemanticAttributes.HTTP_ROUTE]).toEqual('');
    // we need to patch final handler to extract the full url
    expect(span.attributes[ExpressInstrumentationAttributes.EXPRESS_ROUTE_FULL]).toEqual(fullRoute);
    expect(span.attributes[ExpressInstrumentationAttributes.EXPRESS_UNHANDLED]).toEqual(true);
};

// just call next() without doing anything
export const noopMiddleware = (_req: express.Request, _res: express.Response, next: express.NextFunction) => {
    // in real app, we would also have some logic here
    next();
};

// just call next(err) without doing anything
export const noopErrorMiddleware = (
    err: any,
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
) => {
    // in real app, we would also have some logic here
    next(err);
};

export const resEndMiddleware = (_req: express.Request, res: express.Response) => {
    res.sendStatus(200);
};

export const resEndErrorMiddleware = (
    _err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
) => {
    res.sendStatus(500);
};

export const shouldNotInvokeMiddleware = (_req: express.Request, res: express.Response) => {
    throw new Error('middleware should not be invoked');
};

export const errorMiddleware = (_req: express.Request, res: express.Response, next: express.NextFunction) => {
    next('error from express unittests');
};

export const getExpressSpans = (): ReadableSpan[] => {
    return getTestSpans().filter((s) => s.instrumentationLibrary.name?.endsWith('express')) as ReadableSpan[];
};

import { Tracer, Attributes, context, setSpan, Logger } from '@opentelemetry/api';
import { StatusCode, Span, SpanKind } from '@opentelemetry/api';
import { MongoError } from 'mongodb';
import { MongooseResponseCustomAttributesFunction } from './types';
import { safeExecuteInTheMiddle } from '@opentelemetry/instrumentation';
import { DatabaseAttribute, GeneralAttribute } from '@opentelemetry/semantic-conventions';

// ===== Start Span Utils =====

interface StartSpanPayload {
    tracer: Tracer;
    collection: any;
    modelName: string;
    operation: string;
    attributes: Attributes;
    parentSpan?: Span;
}

function getAttributesFromCollection(collection: any): Attributes {
    return {
        [DatabaseAttribute.DB_MONGODB_COLLECTION]: collection.name,
        [DatabaseAttribute.DB_NAME]: collection.conn.name,
        [DatabaseAttribute.DB_USER]: collection.conn.user,
        [GeneralAttribute.NET_PEER_NAME]: collection.conn.host,
        [GeneralAttribute.NET_PEER_PORT]: collection.conn.port,
        [GeneralAttribute.NET_TRANSPORT]: 'IP.TCP', // Always true in mongodb
    };
}

export function startSpan({
    tracer,
    collection,
    modelName,
    operation,
    attributes,
    parentSpan,
}: StartSpanPayload): Span {
    return tracer.startSpan(
        `mongoose.${modelName}.${operation}`,
        {
            kind: SpanKind.CLIENT,
            attributes: {
                ...attributes,
                ...getAttributesFromCollection(collection),
                [DatabaseAttribute.DB_OPERATION]: operation,
                [DatabaseAttribute.DB_SYSTEM]: 'mongodb',
            },
        },
        parentSpan ? setSpan(context.active(), parentSpan) : undefined
    );
}

// ===== End Span Utils =====

function setErrorStatus(span: Span, error: MongoError | Error) {
    span.recordException(error);

    span.setStatus({
        code: StatusCode.ERROR,
        message: `${error.message} ${error instanceof MongoError ? `\nMongo Error Code: ${error.code}` : ''}`,
    });
}

function applyResponseHook(
    span: Span,
    response: any,
    logger: Logger,
    responseHook?: MongooseResponseCustomAttributesFunction
) {
    if (responseHook) {
        safeExecuteInTheMiddle(
            () => responseHook(span, response),
            (e) => {
                if (e) {
                    logger.error('mongoose instrumentation: responseHook error', e);
                }
            },
            true
        );
    }
}

function handlePromiseResponse(
    execResponse: any,
    span: Span,
    logger: Logger,
    responseHook?: MongooseResponseCustomAttributesFunction
): any {
    if (!(execResponse instanceof Promise)) {
        span.end();
        applyResponseHook(span, execResponse, logger, responseHook);
        return execResponse;
    }

    return execResponse
        .then((response) => {
            applyResponseHook(span, response, logger, responseHook);
            return response;
        })
        .catch((err) => {
            setErrorStatus(span, err);
            throw err;
        })
        .finally(() => span.end());
}

function handleCallbackResponse(
    callback: Function,
    exec: Function,
    originalThis: any,
    span: Span,
    logger: Logger,
    responseHook?: MongooseResponseCustomAttributesFunction
) {
    return exec.apply(originalThis, [
        (err: Error, response: any) => {
            err ? setErrorStatus(span, err) : applyResponseHook(span, response, logger, responseHook);
            span.end();
            return callback!(err, response);
        },
    ]);
}

interface HandleResponsePayload {
    span: Span;
    exec: Function;
    callExec: Function;
    logger: Logger;
    originalThis: any;
    args: IArguments;
    callback?: Function;
    responseHook?: MongooseResponseCustomAttributesFunction;
}

export function handleResponse({
    span,
    exec,
    callExec,
    logger,
    originalThis,
    args,
    callback,
    responseHook,
}: HandleResponsePayload) {
    if (callback instanceof Function) {
        return callExec(() => handleCallbackResponse(callback, exec, originalThis, span, logger, responseHook));
    } else {
        const response = callExec(() => exec.apply(originalThis, args));
        return handlePromiseResponse(response, span, logger, responseHook);
    }
}

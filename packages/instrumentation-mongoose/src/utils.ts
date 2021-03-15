import { Tracer, SpanAttributes, SpanStatusCode, context, setSpan, diag, Span, SpanKind } from '@opentelemetry/api';
import type { Collection } from 'mongoose';
import { MongooseResponseCustomAttributesFunction } from './types';
import { safeExecuteInTheMiddle } from '@opentelemetry/instrumentation';
import { DatabaseAttribute, GeneralAttribute } from '@opentelemetry/semantic-conventions';

// ===== Start Span Utils =====

interface StartSpanPayload {
    tracer: Tracer;
    collection: Collection;
    modelName: string;
    operation: string;
    attributes: SpanAttributes;
    parentSpan?: Span;
}

function getAttributesFromCollection(collection: Collection): SpanAttributes {
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

function setErrorStatus(span: Span, error: any = {}) {
    span.recordException(error);

    span.setStatus({
        code: SpanStatusCode.ERROR,
        message: `${error.message} ${error.code ? `\nMongo Error Code: ${error.code}` : ''}`,
    });
}

function applyResponseHook(span: Span, response: any, responseHook?: MongooseResponseCustomAttributesFunction) {
    if (responseHook) {
        safeExecuteInTheMiddle(
            () => responseHook(span, response),
            (e) => {
                if (e) {
                    diag.error('mongoose instrumentation: responseHook error', e);
                }
            },
            true
        );
    }
}

export function handlePromiseResponse(
    execResponse: any,
    span: Span,
    responseHook?: MongooseResponseCustomAttributesFunction
): any {
    if (!(execResponse instanceof Promise)) {
        span.end();
        applyResponseHook(span, execResponse, responseHook);
        return execResponse;
    }

    return execResponse
        .then((response) => {
            applyResponseHook(span, response, responseHook);
            return response;
        })
        .catch((err) => {
            setErrorStatus(span, err);
            throw err;
        })
        .finally(() => span.end());
}

export function handleCallbackResponse(
    callback: Function,
    exec: Function,
    originalThis: any,
    span: Span,
    responseHook?: MongooseResponseCustomAttributesFunction
) {
    return exec.apply(originalThis, [
        (err: Error, response: any) => {
            err ? setErrorStatus(span, err) : applyResponseHook(span, response, responseHook);
            span.end();
            return callback!(err, response);
        },
    ]);
}

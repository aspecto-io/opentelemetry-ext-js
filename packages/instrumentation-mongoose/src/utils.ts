import { Tracer, Attributes, context, setSpan, Logger } from '@opentelemetry/api';
import { StatusCode, Span, SpanKind } from '@opentelemetry/api';
import { MongooseResponseCustomAttributesFunction } from './types';
import { safeExecuteInTheMiddle } from '@opentelemetry/instrumentation';
import { DatabaseAttribute, GeneralAttribute } from '@opentelemetry/semantic-conventions';

interface StartSpanPayload {
    tracer: Tracer;
    collection: any;
    modelName: string;
    operation: string;
    attributes: Attributes;
    parentSpan?: Span;
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

export function handlePromiseResponse(
    execResponse: any,
    span: Span,
    logger: Logger,
    responseHook?: MongooseResponseCustomAttributesFunction
): any {
    if (!(execResponse instanceof Promise)) {
        span.end();
        return execResponse;
    }

    return execResponse
        .then((response) => {
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
            return response;
        })
        .catch((err) => {
            setErrorStatus(span, err);
            throw err;
        })
        .finally(() => span.end());
}

export function setErrorStatus(span: Span, error: any | Error) {
    span.recordException(error);

    span.setStatus({
        code: StatusCode.ERROR,
        message: `${error.message} ${error?.code ? `\nMongo Error Code: ${error.code}` : ''}`,
    });
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

import { Tracer, SpanKind, Span, Context, Link, getActiveSpan } from '@opentelemetry/api';

const START_SPAN_FUNCTION = Symbol('opentelemetry.pubsub-propagation.start_span');
const END_SPAN_FUNCTION = Symbol('opentelemetry.pubsub-propagation.end_span');

const patchArrayFilter = (messages: any[], tracer: Tracer) => {
    const origFunc = messages.filter;
    const patchedFunc = function (..._args) {
        const newArray = origFunc.apply(this, arguments);
        patchArrayForProcessSpans(newArray, tracer);
        return newArray;
    };

    Object.defineProperty(messages, 'filter', {
        enumerable: false,
        value: patchedFunc,
    });
};

const patchArrayFunction = (messages: any[], functionName: string, tracer: Tracer) => {
    const origFunc = messages[functionName];
    const patchedFunc = function (callback: any, thisArg: any) {
        const wrappedCallback = function (message: any) {
            const messageSpan = message?.[START_SPAN_FUNCTION]?.();
            if (!messageSpan) return callback.apply(this, arguments);

            const res = tracer.withSpan(messageSpan, () => {
                try {
                    return callback.apply(this, arguments);
                } catch (err) {
                    throw err;
                } finally {
                    message[END_SPAN_FUNCTION]?.();
                }
            });

            if (typeof res === 'object') {
                Object.defineProperty(
                    res,
                    START_SPAN_FUNCTION,
                    Object.getOwnPropertyDescriptor(message, START_SPAN_FUNCTION)
                );
                Object.defineProperty(
                    res,
                    END_SPAN_FUNCTION,
                    Object.getOwnPropertyDescriptor(message, END_SPAN_FUNCTION)
                );
            }
            return res;
        };
        const funcResult = origFunc.call(this, wrappedCallback, thisArg);
        if (Array.isArray(funcResult)) patchArrayForProcessSpans(funcResult, tracer);
        return funcResult;
    };

    Object.defineProperty(messages, functionName, {
        enumerable: false,
        value: patchedFunc,
    });
};

const patchArrayForProcessSpans = (messages: any[], tracer: Tracer) => {
    patchArrayFunction(messages, 'forEach', tracer);
    patchArrayFunction(messages, 'map', tracer);
    patchArrayFilter(messages, tracer);
};

const startMessagingProcessSpan = (
    message: any,
    name: string,
    attributes: Record<string, string>,
    parentSpan: Span,
    propagatedContext: Context,
    tracer: Tracer
): Span => {
    const links: Link[] = [];
    const spanContext = getActiveSpan(propagatedContext)?.context();
    if (spanContext) {
        links.push({
            context: spanContext,
        } as Link);
    }

    const spanName = `${name} process`;
    const messageSpan = tracer.startSpan(spanName, {
        kind: SpanKind.CONSUMER,
        attributes: {
            ...attributes,
            ['messaging.operation']: 'process',
        },
        links,
        parent: parentSpan,
    });

    Object.defineProperty(message, START_SPAN_FUNCTION, {
        enumerable: false,
        writable: true,
        value: () => messageSpan,
    });

    Object.defineProperty(message, END_SPAN_FUNCTION, {
        enumerable: false,
        writable: true,
        value: () => {
            messageSpan.end();
            Object.defineProperty(message, END_SPAN_FUNCTION, {
                enumerable: false,
                writable: true,
                value: () => {},
            });
        },
    });

    return messageSpan;
};

interface SpanDetails {
    attributes: Record<string, any>;
    parentContext: Context;
    name: string;
}

interface PatchForProcessingPayload<T> {
    messages: T[];
    tracer: Tracer;
    parentSpan: Span;
    messageToSpanDetails: (message: T) => SpanDetails;
}

const patchMessagesArrayToStartProcessSpans = <T>({
    messages,
    tracer,
    parentSpan,
    messageToSpanDetails,
}: PatchForProcessingPayload<T>) => {
    messages.forEach((message) => {
        const { attributes, name, parentContext } = messageToSpanDetails(message);

        Object.defineProperty(message, START_SPAN_FUNCTION, {
            enumerable: false,
            writable: true,
            value: () => startMessagingProcessSpan(message, name, attributes, parentSpan, parentContext, tracer),
        });
    });
};

export default {
    patchMessagesArrayToStartProcessSpans,
    patchArrayForProcessSpans,
};

import { Tracer, SpanKind, Span, Context, Link, getSpanContext, context, setSpan } from '@opentelemetry/api';

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

            const res = context.with(setSpan(context.active(), messageSpan), () => {
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

const startMessagingProcessSpan = <T>(
    message: any,
    name: string,
    attributes: Record<string, string>,
    parentContext: Context,
    propagatedContext: Context,
    tracer: Tracer,
    processHook?: ProcessHook<T>
): Span => {
    const links: Link[] = [];
    const spanContext = getSpanContext(propagatedContext);
    if (spanContext) {
        links.push({
            context: spanContext,
        } as Link);
    }

    const spanName = `${name} process`;
    const processSpan = tracer.startSpan(
        spanName,
        {
            kind: SpanKind.CONSUMER,
            attributes: {
                ...attributes,
                ['messaging.operation']: 'process',
            },
            links,
        },
        parentContext
    );

    Object.defineProperty(message, START_SPAN_FUNCTION, {
        enumerable: false,
        writable: true,
        value: () => processSpan,
    });

    Object.defineProperty(message, END_SPAN_FUNCTION, {
        enumerable: false,
        writable: true,
        value: () => {
            processSpan.end();
            Object.defineProperty(message, END_SPAN_FUNCTION, {
                enumerable: false,
                writable: true,
                value: () => {},
            });
        },
    });

    if (processHook) {
        try {
            processHook(processSpan, message);
        } catch {}
    }

    return processSpan;
};

interface SpanDetails {
    attributes: Record<string, any>;
    parentContext: Context;
    name: string;
}

type ProcessHook<T> = (processSpan: Span, message: T) => void;

interface PatchForProcessingPayload<T> {
    messages: T[];
    tracer: Tracer;
    parentContext: Context;
    messageToSpanDetails: (message: T) => SpanDetails;
    processHook?: ProcessHook<T>;
}

const patchMessagesArrayToStartProcessSpans = <T>({
    messages,
    tracer,
    parentContext,
    messageToSpanDetails,
    processHook,
}: PatchForProcessingPayload<T>) => {
    messages.forEach((message) => {
        const { attributes, name, parentContext: propagatedContext } = messageToSpanDetails(message);

        Object.defineProperty(message, START_SPAN_FUNCTION, {
            enumerable: false,
            writable: true,
            value: () =>
                startMessagingProcessSpan<T>(
                    message,
                    name,
                    attributes,
                    parentContext,
                    propagatedContext,
                    tracer,
                    processHook
                ),
        });
    });
};

export default {
    patchMessagesArrayToStartProcessSpans,
    patchArrayForProcessSpans,
};

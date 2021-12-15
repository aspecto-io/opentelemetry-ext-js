import { SpanAttributes, SpanKind } from '@opentelemetry/api';
import { timeInputToHrTime } from '@opentelemetry/core';
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';

const getJaegerValueForTag = (jaegerTagKey, tags) => tags.filter(({ key }) => jaegerTagKey === key)?.[0]?.value;
const convertJaegerTagsToAttributes = (tags): SpanAttributes => {
    const spanAttributes: SpanAttributes = {};
    tags.forEach(({ key, value }) => {
        spanAttributes[key] = value;
    });
    return spanAttributes;
}

const getOtelKindFromJaegerKind = (jaegerKind: string) => {
    switch (jaegerKind) {
        case 'client':
            return SpanKind.CLIENT;
        case 'producer':
            return SpanKind.PRODUCER;
        case 'server':
            return SpanKind.SERVER;
        case 'consumer':
            return SpanKind.CONSUMER;
        default:
            return SpanKind.INTERNAL;
    }
}

export const convertJaegerSpanToOtel = (jaegerSpan): ReadableSpan => {
    const durationMillis =  jaegerSpan.duration / 1000;
    const startDateMillis = jaegerSpan.startTime / 1000;
    const endDateMillis = timeInputToHrTime(new Date(startDateMillis + durationMillis));
    return {
        name: jaegerSpan.operationName,
        kind: getOtelKindFromJaegerKind(getJaegerValueForTag('span.kind', jaegerSpan.tags)),
        attributes: convertJaegerTagsToAttributes(jaegerSpan.tags),
        duration: timeInputToHrTime(durationMillis),
        startTime: timeInputToHrTime(startDateMillis),
        endTime: endDateMillis,
        links: [],
        spanContext: () => null,
        instrumentationLibrary: {
            name: getJaegerValueForTag('otel.library.name', jaegerSpan.tags),
            version: getJaegerValueForTag('otel.library.version', jaegerSpan.tags),
        },
        events: [],
        ended: true,
        status: getJaegerValueForTag('otel.status_code', jaegerSpan.tags),
        resource: jaegerSpan.processID,
    }
}
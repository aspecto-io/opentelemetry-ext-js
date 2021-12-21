import { SpanAttributes, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { timeInputToHrTime } from '@opentelemetry/core';
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { Resource } from '@opentelemetry/resources';
import { JaegerSpan, JaegerTag } from './interfaces/jaeger';

const getJaegerValueForTag = (jaegerTagKey: string, tags: JaegerTag[]) =>
    tags.find(({ key }) => jaegerTagKey === key)?.value;
const convertJaegerTagsToAttributes = (tags): SpanAttributes => {
    const spanAttributes: SpanAttributes = {};
    tags.forEach(({ key, value }) => {
        spanAttributes[key] = value;
    });
    return spanAttributes;
};

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
};

const getParentSpanID = (jaegerSpan: JaegerSpan) =>
    jaegerSpan.references?.find(({ refType }) => refType === 'CHILD_OF')?.spanID;

const getSpanStatusCodeByStatusText = (status: string) => {
    switch (status?.toUpperCase()) {
        case 'OK':
            return SpanStatusCode.OK;
        case 'ERROR':
            return SpanStatusCode.ERROR;
        default:
            return SpanStatusCode.UNSET;
    }
};

export const convertJaegerSpanToOtelReadableSpan = (jaegerSpan: JaegerSpan): ReadableSpan => {
    const durationMillis = jaegerSpan.duration / 1000;
    const startDateMillis = jaegerSpan.startTime / 1000;
    const endDateMillis = timeInputToHrTime(new Date(startDateMillis + durationMillis));

    return {
        name: jaegerSpan.operationName,
        kind: getOtelKindFromJaegerKind(getJaegerValueForTag('span.kind', jaegerSpan.tags)),
        attributes: convertJaegerTagsToAttributes(jaegerSpan.tags),
        parentSpanId: getParentSpanID(jaegerSpan),
        duration: timeInputToHrTime(durationMillis),
        startTime: timeInputToHrTime(startDateMillis),
        endTime: endDateMillis,
        links: [],
        spanContext: () => ({
            traceId: jaegerSpan.traceID,
            spanId: jaegerSpan.spanID,
            traceFlags: jaegerSpan.flags,
        }),
        instrumentationLibrary: {
            name: getJaegerValueForTag('otel.library.name', jaegerSpan.tags),
            version: getJaegerValueForTag('otel.library.version', jaegerSpan.tags),
        },
        events: [],
        ended: true,
        status: {
            code: getSpanStatusCodeByStatusText(getJaegerValueForTag('otel.status_code', jaegerSpan.tags)),
        },
        resource: new Resource({
            'service.name': getJaegerValueForTag('service.name', jaegerSpan.tags),
        }),
    };
};

import {
    Context,
    TraceFlags,
    TextMapPropagator,
    TextMapSetter,
    TextMapGetter,
    getSpanContext,
    setSpanContext,
} from '@opentelemetry/api';

export class DummyPropagation implements TextMapPropagator {
    static TRACE_CONTEXT_KEY = 'x-dummy-trace-id';
    static SPAN_CONTEXT_KEY = 'x-dummy-span-id';

    extract(context: Context, carrier: unknown, getter: TextMapGetter) {
        const extractedSpanContext = {
            traceId: getter.get(carrier, DummyPropagation.TRACE_CONTEXT_KEY) as string,
            spanId: getter.get(carrier, DummyPropagation.SPAN_CONTEXT_KEY) as string,
            traceFlags: TraceFlags.SAMPLED,
        };

        if (!extractedSpanContext.traceId || !extractedSpanContext.spanId) return context;

        return setSpanContext(context, extractedSpanContext);
    }

    inject(context: Context, carrier: unknown, setter: TextMapSetter): void {
        const spanContext = getSpanContext(context);
        if (!spanContext) return;

        setter.set(carrier, DummyPropagation.TRACE_CONTEXT_KEY, spanContext.traceId);
        setter.set(carrier, DummyPropagation.SPAN_CONTEXT_KEY, spanContext.spanId);
    }

    fields(): string[] {
        return [DummyPropagation.TRACE_CONTEXT_KEY, DummyPropagation.SPAN_CONTEXT_KEY];
    }
}

import {
  Context,
  HttpTextPropagator,
  TraceFlags,
  SetterFunction,
  GetterFunction,
} from "@opentelemetry/api";
import {
  getParentSpanContext,
  setExtractedSpanContext,
} from "@opentelemetry/core";

export class DummyPropagation implements HttpTextPropagator {
  static TRACE_CONTEXT_KEY = "x-dummy-trace-id";
  static SPAN_CONTEXT_KEY = "x-dummy-span-id";

  extract(context: Context, carrier: unknown, getter: GetterFunction) {
    const extractedSpanContext = {
      traceId: getter(carrier, DummyPropagation.TRACE_CONTEXT_KEY) as string,
      spanId: getter(carrier, DummyPropagation.SPAN_CONTEXT_KEY) as string,
      traceFlags: TraceFlags.SAMPLED,
    };

    if (!extractedSpanContext.traceId || !extractedSpanContext.spanId)
      return context;

    return setExtractedSpanContext(context, extractedSpanContext);
  }

  inject(context: Context, carrier: unknown, setter: SetterFunction): void {
    const spanContext = getParentSpanContext(context);
    if (!spanContext) return;

    setter(carrier, DummyPropagation.TRACE_CONTEXT_KEY, spanContext.traceId);
    setter(carrier, DummyPropagation.SPAN_CONTEXT_KEY, spanContext.spanId);
  }
}

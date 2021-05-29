import { InMemorySpanExporter, ReadableSpan } from "@opentelemetry/tracing";

const OTEL_TESTING_MEMORY_EXPORTER = Symbol.for('opentelemetry.testing.memory_exporter');

export const getTestMemoryExporter = (): InMemorySpanExporter => {
    return global[OTEL_TESTING_MEMORY_EXPORTER];
}

export const setTestMemoryExporter = (memoryExporter: InMemorySpanExporter) => {
    global[OTEL_TESTING_MEMORY_EXPORTER] = memoryExporter;
}

export const getTestSpans = (): ReadableSpan[] => {
    return getTestMemoryExporter().getFinishedSpans();
}

export const resetMemoryExporter = () => {
    getTestMemoryExporter().reset();
}

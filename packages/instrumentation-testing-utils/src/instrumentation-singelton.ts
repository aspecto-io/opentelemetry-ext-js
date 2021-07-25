import { InstrumentationBase } from '@opentelemetry/instrumentation';

const OTEL_TESTING_INSTRUMENTATION_SINGLETON = Symbol.for('opentelemetry.testing.instrumentation_singleton');

export const getInstrumentation = <T extends InstrumentationBase>(): T => {
    return global[OTEL_TESTING_INSTRUMENTATION_SINGLETON];
};

export const registerInstrumentation = <T extends InstrumentationBase>(instrumentation: T): T => {
    const existing = getInstrumentation<T>();
    if (existing) {
        return existing;
    }
    global[OTEL_TESTING_INSTRUMENTATION_SINGLETON] = instrumentation;
    return instrumentation;
};

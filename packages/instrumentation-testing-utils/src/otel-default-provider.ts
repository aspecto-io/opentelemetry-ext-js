import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { NodeTracerProvider, NodeTracerConfig } from '@opentelemetry/node';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/tracing';
import { getTestMemoryExporter, setTestMemoryExporter } from './otel-provider-api';

export const registerInstrumentationTestingProvider = (config?: NodeTracerConfig): NodeTracerProvider => {
    const otelTestingProvider = new NodeTracerProvider(config);

    setTestMemoryExporter(new InMemorySpanExporter());
    otelTestingProvider.addSpanProcessor(new SimpleSpanProcessor(getTestMemoryExporter()));

    if (process.env.OTEL_EXPORTER_JAEGER_AGENT_HOST) {
        otelTestingProvider.addSpanProcessor(new SimpleSpanProcessor(new JaegerExporter()));
    }

    otelTestingProvider.register();
    return otelTestingProvider;
};

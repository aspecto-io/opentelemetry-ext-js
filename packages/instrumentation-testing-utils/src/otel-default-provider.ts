
import { JaegerExporter } from "@opentelemetry/exporter-jaeger";
import { NodeTracerProvider } from "@opentelemetry/node";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/tracing";
import { getTestMemoryExporter, setTestMemoryExporter } from "./otel-provider-api";
// import { CollectorTraceExporter as CollectorTraceExporterHttpJson } from '@opentelemetry/exporter-collector';

// import { defaultOtlpCollectorEndpoint, getAspectoResource } from '@aspecto/opentelemetry';

// const resource = getAspectoResource({ env: 'test' });
// resource['aspecto.testing'] = true;

export const registerInstrumentationTestingProvider = (serviceName: string) => {
    const otelTestingProvider = new NodeTracerProvider();

    setTestMemoryExporter(new InMemorySpanExporter());
    otelTestingProvider.addSpanProcessor(new SimpleSpanProcessor(getTestMemoryExporter()));
    
    if (process.env.OTEL_EXPORTER_JAEGER_AGENT_HOST) {
        otelTestingProvider.addSpanProcessor(
            new SimpleSpanProcessor(new JaegerExporter({ serviceName }))
        );
    }
    // otelTestingProvider.addSpanProcessor(new SimpleSpanProcessor(new CollectorTraceExporterHttpJson({
    //     url: defaultOtlpCollectorEndpoint,
    //     serviceName,
    // })));
    
    otelTestingProvider.register();    
}


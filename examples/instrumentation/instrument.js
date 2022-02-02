const opentelemetry = require('@opentelemetry/api');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-proto');
const { detectSyncResources } = require('opentelemetry-resource-detector-sync-api');
const { serviceSyncDetector } = require('opentelemetry-resource-detector-service');

const { diag, DiagConsoleLogger, DiagLogLevel } = opentelemetry;
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

const instrument = () => {
    const resource = detectSyncResources({
        detectors: [serviceSyncDetector],
    });

    const provider = new NodeTracerProvider({ resource });
    provider.addSpanProcessor(new SimpleSpanProcessor(new OTLPTraceExporter({ url: 'http://localhost:4318/v1/trace'})));
    provider.register();
};

instrument();

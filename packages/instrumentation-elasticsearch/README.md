# OpenTelemetry Elasticsearch Instrumentation for Node.js
[![NPM version](https://img.shields.io/npm/v/opentelemetry-instrumentation-elasticsearch.svg)](https://www.npmjs.com/package/opentelemetry-instrumentation-elasticsearch)

This module provides automatic instrumentation for [`@elastic/elasticsearch`](https://github.com/elastic/elasticsearch-js) and follows otel [DB Semantic Conventions](https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/trace/semantic_conventions/database.md).  

## Installation

```
npm install opentelemetry-instrumentation-elasticsearch
```

## Usage
For further automatic instrumentation instruction see the [@opentelemetry/instrumentation](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-instrumentation) package.

```js
const { NodeTracerProvider } = require('@opentelemetry/node');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { ElasticsearchInstrumentation } = require('opentelemetry-instrumentation-elasticsearch');

registerInstrumentations({
  traceProvider,
  instrumentations: [
    new ElasticsearchInstrumentation({
      // see under for available configuration
    })
  ]
});
```

### Elasticsearch Instrumentation Options

Elasticsearch instrumentation has few options available to choose from. You can set the following (all optional):

| Options        | Type                                   | Description                                                                                     |
| -------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `suppressInternalInstrumentation` | `boolean` | Elasticsearch operation use http/https under the hood. Setting this to true will hide the underlying request spans (if instrumented). |
| `responseHook` | `ElasticsearchResponseCustomAttributesFunction` | Hook called before response is returned, which allows to add custom attributes to span.      |
| `dbStatementSerializer` | `DbStatementSerializer` | Elasticsearch instrumentation will serialize `db.statement` using the specified function.

Please make sure `dbStatementSerializer` is error proof, as errors are not handled while executing this function.

---

This extension (and many others) was developed by [Aspecto](https://www.aspecto.io/) with ❤️

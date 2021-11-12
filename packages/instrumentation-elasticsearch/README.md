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
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { ElasticsearchInstrumentation } = require('opentelemetry-instrumentation-elasticsearch');

registerInstrumentations({
  tracerProvider,
  instrumentations: [
    new ElasticsearchInstrumentation({
      // Config example (all optional)
      suppressInternalInstrumentation: false,
      moduleVersionAttributeName: 'elasticsearchClient.version',
      responseHook: (span, result) => {
        span.setAttribute('db.response', JSON.stringify(result));
      },
      dbStatementSerializer: (operation, params, options) => {
        return JSON.stringify(params);
      }
    })
  ]
});
```

### Elasticsearch Instrumentation Options

Elasticsearch instrumentation has few options available to choose from. You can set the following (all optional):

| Options | Type | Default | Description |
| --- | --- | --- | --- |
| `suppressInternalInstrumentation` | `boolean` | `false` | Elasticsearch operation use http/https under the hood. Setting this to true will hide the underlying request spans (if instrumented). |
| `responseHook` | `ResponseHook` (function) | `undefined` | Hook called before response is returned, which allows to add custom attributes to span.<br>Function receive params: `span`<br>`result` (object) |
| `dbStatementSerializer` | `DbStatementSerializer` (function) | `JSON.stringify({params, options})` | Elasticsearch instrumentation will serialize `db.statement` using this function response.<br>Function receive params: `operation` (string)<br>`params` (object)<br>`options` (object)<br>Function response must be a `string`
| `moduleVersionAttributeName` | `string` | `undefined` | If passed, a span attribute will be added to all spans with key of the provided `moduleVersionAttributeName` and value of the `@elastic/elasticsearch` version |

Please make sure `dbStatementSerializer` is error proof, as errors are not handled while executing this function.

### `db.operation` attribute
`db.operation` contain the API function called. 
For the full list see [API reference](https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/api-reference.html).

Few examples: 
* `client.bulk`
* `client.search`
* `client.index`
* `cat.shards`
* `cluster.health`

---

This extension (and many others) was developed by [Aspecto](https://www.aspecto.io/) with ❤️

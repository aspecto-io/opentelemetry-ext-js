# OpenTelemetry node-cache Instrumentation for Node.js
[![NPM version](https://img.shields.io/npm/v/opentelemetry-instrumentation-node-cache.svg)](https://www.npmjs.com/package/opentelemetry-instrumentation-node-cache)

This module provides automatic instrumentation for [`node-cache`](https://www.npmjs.com/package/node-cache).  
> Supports versions **>=5.0.0** of node-cache

## Installation

```
npm install --save opentelemetry-instrumentation-node-cache
```

## Usage
For further automatic instrumentation instruction see the [@opentelemetry/instrumentation](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-instrumentation) package.

```js
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { NodeCacheInstrumentation } = require('opentelemetry-instrumentation-node-cache');

registerInstrumentations({
  tracerProvider,
  instrumentations: [
    new NodeCacheInstrumentation({
      // see under for available configuration
    })
  ]
});
```

### node-cache Instrumentation Options

node-cache instrumentation has few options available to choose from. You can set the following:

| Option | Type  | Description |
| --- | --- | --- |
| `requestHook` | function | Hook for adding custom attributes before express start handling the request. Receives params: `span, { moduleVersion, operation, args }` |
| `responseHook` | function | Hook called before response is returned, which allows to add custom attributes to span.<br>Function receive params: `span, { operation, response }` |
| `requireParentSpan` | `boolean` | Set to true if you only want to trace operation which has parent spans |

See the [tests](./test/node-cache.spec.ts) for config usage example.


---

This extension (and many others) was developed by [Aspecto](https://www.aspecto.io/) with ❤️

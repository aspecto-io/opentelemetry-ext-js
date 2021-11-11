# OpenTelemetry Neo4j Instrumentation for Node.js
[![NPM version](https://img.shields.io/npm/v/opentelemetry-instrumentation-neo4j.svg)](https://www.npmjs.com/package/opentelemetry-instrumentation-neo4j)

This module provides automatic instrumentation for [`neo4j-javascript-driver`](https://github.com/neo4j/neo4j-javascript-driver).  
> Supports versions **>=4.0.0** of neo4j-driver

## Installation

```
npm install --save opentelemetry-instrumentation-neo4j
```

## Usage
For further automatic instrumentation instruction see the [@opentelemetry/instrumentation](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-instrumentation) package.

```js
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { Neo4jInstrumentation } = require('opentelemetry-instrumentation-neo4j');

registerInstrumentations({
  tracerProvider,
  instrumentations: [
    new Neo4jInstrumentation({
      // see under for available configuration
    })
  ]
});
```

### Neo4j Instrumentation Options

Neo4j instrumentation has few options available to choose from. You can set the following:

| Options        | Type                                   | Description                                                                                     |
| -------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `responseHook` | `Neo4jResponseCustomAttributesFunction` | Hook called before response is returned, which allows to add custom attributes to span.      |
| `ignoreOrphanedSpans` | `boolean` | Set to true if you only want to trace operation which has parent spans |
| `moduleVersionAttributeName` | `string` | If passed, a span attribute will be added to all spans with key of the provided `moduleVersionAttributeName` and value of the patched module version |


---

This extension (and many others) was developed by [Aspecto](https://www.aspecto.io/) with ❤️

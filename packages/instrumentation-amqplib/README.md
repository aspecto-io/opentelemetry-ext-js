# OpenTelemetry amqplib Instrumentation for Node.js
[![NPM version](https://img.shields.io/npm/v/opentelemetry-instrumentation-amqplib.svg)](https://www.npmjs.com/package/opentelemetry-instrumentation-amqplib)

This module provides automatic instrumentation for [`amqplib`](https://github.com/squaremo/amqp.node).

## Installation

```
npm install --save opentelemetry-instrumentation-amqplib
```

## Usage
For further automatic instrumentation instruction see the [@opentelemetry/instrumentation](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-instrumentation) package.

```js
const { NodeTracerProvider } = require('@opentelemetry/node');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { AmqplibInstrumentation } = require('opentelemetry-instrumentation-amqplib');

registerInstrumentations({
  traceProvider,
  instrumentations: [
    new AmqplibInstrumentation({
      // see under for available configuration
    })
  ]
});
```

### amqplib Instrumentation Options

amqplib instrumentation has few options available to choose from. You can set the following:

| Options        | Type                                   | Description                                                                                     |
| -------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `moduleVersionAttributeName` | `string` | If passed, a span attribute will be added to all spans with key of the provided `moduleVersionAttributeName` and value of the patched module version |



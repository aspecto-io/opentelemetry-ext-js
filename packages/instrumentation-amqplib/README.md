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
| `publishHook` | `strAmqplibPublishCustomAttributeFunctioning` | hook for adding custom attributes before publish message is sent |
| `consumeHook` | `AmqplibConsumerCustomAttributeFunction` | hook for adding custom attributes before consumer message is processed |
| `consumeEndHook` | `strAmqplibPublishCustomAttributeFunctioning` | hook for adding custom attributes after consumer message is acked to server |
| `moduleVersionAttributeName` | `string` | If passed, a span attribute will be added to all spans with key of the provided `moduleVersionAttributeName` and value of the patched module version |
| `consumeTimeoutMs` | `number` | default is 1 minute. read [description below](#InstrumentationTimeout)|
---

This extension (and many others) was developed by [Aspecto](https://www.aspecto.io/) with ❤️

## Implementation Issues

### Instrumentation Timeout
The instrumentation is keeping track on open consumed messages which are not acked yet to support `ackAll`/`allUpTo` etc features.

Saving a reference, means the msg will not be garbage collected if user forget about it
and never ack the msg.
To insure we don't leak memory, the instrumentation has internal timeout **which is not
correlated to the server timeout if one is set**, and which will trigger ending the span when reached.
This timeout is by default set to 1 minute, and should be reviewed in each use case, for example if handling consumed messages is expected to take more than 1 minute.

# OpenTelemetry kafkajs Instrumentation for Node.js
[![NPM version](https://img.shields.io/npm/v/opentelemetry-instrumentation-kafkajs.svg)](https://www.npmjs.com/package/opentelemetry-instrumentation-kafkajs)

This module provides automatic instrumentation for [`kafkajs`](https://kafka.js.org/).

## Installation

```
npm install --save opentelemetry-instrumentation-kafkajs
```

## Usage

For further automatic instrumentation instruction see the [@opentelemetry/instrumentation](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-instrumentation) package.

```js
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { KafkaJsInstrumentation } = require('opentelemetry-instrumentation-kafkajs');

const tracerProvider = new NodeTracerProvider({
  // be sure to disable old plugin
  plugins: {
    kafkajs: { enabled: false, path: 'opentelemetry-plugin-kafkajs' }
  }
});

registerInstrumentations({
  tracerProvider,
  instrumentations: [
    new KafkaJsInstrumentation({
      // see under for available configuration
    })
  ]
});
```

### kafkajs Instrumentation Options

kafkajs instrumentation has few options available to choose from. You can set the following:

| Options        | Type                                   | Description                                                                                     |
| -------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `producerHook` | `KafkaProducerCustomAttributeFunction` | Hook called before producer message is sent, which allow to add custom attributes to span.      |
| `consumerHook` | `KafkaConsumerCustomAttributeFunction` | Hook called before consumer message is processed, which allow to add custom attributes to span. |
| `moduleVersionAttributeName` | `string` | If passed, a span attribute will be added to all spans with key of the provided `moduleVersionAttributeName` and value of the patched module version |

---

This extension (and many others) was developed by [Aspecto](https://www.aspecto.io/) with ❤️

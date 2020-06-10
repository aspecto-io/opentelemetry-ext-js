# OpenTelemetry kafkajs Instrumentation for Node.js

This module provides automatic instrumentation for [`kafkajs`](https://kafka.js.org/).

## Installation

```
npm install --save opentelemetry-plugin-kafkajs
```

## Usage

To load a specific plugin (**kafkajs** in this case), specify it in the Node Tracer's configuration

```js
const { NodeTracerProvider } = require("opentelemetry-plugin-kafkajs");

const provider = new NodeTracerProvider({
  plugins: {
    kafkajs: {
      enabled: true,
      // You may use a package name or absolute path to the file.
      path: "opentelemetry-plugin-kafkajs",
    },
  },
});
```

### kafkajs Plugin Options

kafkajs plugin has few options available to choose from. You can set the following:

| Options        | Type                                   | Description                                                                                     |
| -------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `producerHook` | `KafkaProducerCustomAttributeFunction` | Hook called before producer message is sent, which allow to add custom attributes to span.      |
| `consumerHook` | `KafkaConsumerCustomAttributeFunction` | Hook called before consumer message is processed, which allow to add custom attributes to span. |

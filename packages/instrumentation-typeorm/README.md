# OpenTelemetry TypeORM Instrumentation for Node.js
[![NPM version](https://img.shields.io/npm/v/opentelemetry-instrumentation-typeorm.svg)](https://www.npmjs.com/package/opentelemetry-instrumentation-typeorm)

This module provides automatic instrumentation for [`TypeORM`](https://typeorm.io/).

## Installation

```
npm install --save opentelemetry-instrumentation-typeorm
```

## Usage
For further automatic instrumentation instruction see the [@opentelemetry/instrumentation](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-instrumentation) package.

```js
const { NodeTracerProvider } = require('@opentelemetry/node');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { TypeormInstrumentation } = require('opentelemetry-instrumentation-typeorm');

const traceProvider = new NodeTracerProvider({
  // be sure to disable old plugin
  plugins: {
    typeorm: { enabled: false, path: 'opentelemetry-plugin-typeorm' }
  }
});

registerInstrumentations({
  traceProvider,
  instrumentations: [
    new TypeormInstrumentation({
      // see under for available configuration
    })
  ]
});
```

### TypeORM Instrumentation Options

TypeORM instrumentation has few options available to choose from. You can set the following:

| Options        | Type                                   | Description                                                                                     |
| -------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `responseHook` | `TypeormResponseCustomAttributesFunction` | Hook called before response is returned, which allows to add custom attributes to span.      |


---

This extension (and many others) was developed by [Aspecto](https://www.aspecto.io/) with ❤️

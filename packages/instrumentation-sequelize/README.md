# OpenTelemetry Sequelize Instrumentation for Node.js
[![NPM version](https://img.shields.io/npm/v/opentelemetry-instrumentation-sequelize.svg)](https://www.npmjs.com/package/opentelemetry-instrumentation-sequelize)

This module provides automatic instrumentation for [`Sequelize`](https://sequelize.org/).
> _Tested and worked on versions v4, v5 and v6 of Sequelize._

## Installation

```
npm install --save opentelemetry-instrumentation-sequelize
```

## Usage
For further automatic instrumentation instruction see the [@opentelemetry/instrumentation](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-instrumentation) package.

```js
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { SequelizeInstrumentation } = require('opentelemetry-instrumentation-sequelize');

const tracerProvider = new NodeTracerProvider({
  // be sure to disable old plugin
  plugins: {
    sequelize: { enabled: false, path: 'opentelemetry-plugin-sequelize' }
  }
});

registerInstrumentations({
  tracerProvider,
  instrumentations: [
    new SequelizeInstrumentation({
      // see under for available configuration
    })
  ]
});
```

### Sequelize Instrumentation Options

Sequelize instrumentation has few options available to choose from. You can set the following:

| Options        | Type                                   | Description                                                                                     |
| -------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `queryHook` | `SequelizeQueryHook` | Hook called before query is run, which allows to add custom attributes to span.      |
| `responseHook` | `SequelizeResponseCustomAttributesFunction` | Hook called before response is returned, which allows to add custom attributes to span.      |
| `ignoreOrphanedSpans` | `boolean` | Set to true if you only want to trace operation which has parent spans |
| `moduleVersionAttributeName` | `string` | If passed, a span attribute will be added to all spans with key of the provided `moduleVersionAttributeName` and value of the patched module version |
| `suppressInternalInstrumentation` | `boolean` | Sequelize operation use db libs under the hood. Setting this to true will hide the underlying spans (if instrumented). |


## Semantic Behavior
Internal implementation queries generated on startup from connection-manager are not instrumented.

---

This extension (and many others) was developed by [Aspecto](https://www.aspecto.io/) with ❤️

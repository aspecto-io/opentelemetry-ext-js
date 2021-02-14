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
const { NodeTracerProvider } = require('@opentelemetry/node');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { SequelizeInstrumentation } = require('opentelemetry-instrumentation-sequelize');

const traceProvider = new NodeTracerProvider({
  // be sure to disable old plugin
  plugins: {
    sequelize: { enabled: false, path: 'opentelemetry-plugin-sequelize' }
  }
});

registerInstrumentations({
  traceProvider,
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
| `responseHook` | `SequelizeResponseCustomAttributesFunction` | Hook called before response is returned, which allows to add custom attributes to span.      |
| `ignoreOrphanedSpans` | `boolean` | Set to true if you only want to trace operation which has parent spans |

---

This extension (and many others) was developed by [Aspecto](https://www.aspecto.io/) with ❤️

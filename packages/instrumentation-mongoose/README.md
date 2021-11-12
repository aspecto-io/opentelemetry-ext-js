# OpenTelemetry Mongoose Instrumentation for Node.js
[![NPM version](https://img.shields.io/npm/v/opentelemetry-instrumentation-mongoose.svg)](https://www.npmjs.com/package/opentelemetry-instrumentation-mongoose)

This package is heavily based on [@wdalmut/opentelemetry-plugin-mongoose](https://github.com/wdalmut/opentelemetry-plugin-mongoose).  
This module provides automatic instrumentation for [`mongoose`](https://mongoosejs.com/) and follows otel [DB Semantic Conventions](https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/trace/semantic_conventions/database.md).  

## Installation

```
npm install --save opentelemetry-instrumentation-mongoose
```

## Usage
For further automatic instrumentation instruction see the [@opentelemetry/instrumentation](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-instrumentation) package.

```js
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { MongooseInstrumentation } = require('opentelemetry-instrumentation-mongoose');

registerInstrumentations({
  tracerProvider,
  instrumentations: [
    new MongooseInstrumentation({
      // see under for available configuration
    })
  ]
});
```

### Mongoose Instrumentation Options

Mongoose instrumentation has few options available to choose from. You can set the following (all optional):

| Options        | Type                                   | Description                                                                                     |
| -------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `suppressInternalInstrumentation` | `boolean` | Mongoose operation use mongodb under the hood. Setting this to true will hide the underlying mongodb spans (if instrumented). |
| `responseHook` | `MongooseResponseCustomAttributesFunction` | Hook called before response is returned, which allows to add custom attributes to span.      |
| `dbStatementSerializer` | `DbStatementSerializer` | Mongoose instrumentation will serialize `db.statement` using the specified function.
| `moduleVersionAttributeName` | `string` | If passed, a span attribute will be added to all spans with key of the provided `moduleVersionAttributeName` and value of the patched module version |
| `requireParentSpan` | `boolean` | Set to true if you do not want to collect traces that start with mongoose |

### Custom `db.statement` Serializer

By default, this instrumentation does not populate the `db.statement` attribute.  
If you pass `dbStatementSerializer` while using this plugin, the return value of the serializer will be placed in the `db.statement`.

Serializer meets the following interfaces:
```ts
interface SerializerPayload {
    condition?: any;
    options?: any;
    updates?: any;
    document?: any;
    aggregatePipeline?: any;
}

type DbStatementSerializer = (operation: string, payload: SerializerPayload) => string;
```
Please make sure `dbStatementSerializer` is error proof, as errors are not handled while executing this function.

## Difference from [opentelemetry-plugin-mongoose](https://github.com/wdalmut/opentelemetry-plugin-mongoose)

* This lib is using the opentelemetry instrumentation api, as opposed to the old plugin api.
* This lib is using the latest opentelemetry version, as opposed to 0.6.0.
* Strictly follows opentelemetry database client [semantic conventions](https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/trace/semantic_conventions/database.md).
* Has the ability to suppress internal instrumentation.
* Provides statement serializer and a response hook.
* Contains several bug fixes.

---

This extension (and many others) was developed by [Aspecto](https://www.aspecto.io/) with ❤️

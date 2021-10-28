# OpenTelemetry socket.io Instrumentation for Node.js
[![NPM version](https://img.shields.io/npm/v/opentelemetry-instrumentation-socket.io.svg)](https://www.npmjs.com/package/opentelemetry-instrumentation-socket.io)

This module provides automatic instrumentation for [`socket.io`](https://github.com/socketio/socket.io).

## Installation

```
npm install --save opentelemetry-instrumentation-socket.io
```

## Usage
For further automatic instrumentation instruction see the [@opentelemetry/instrumentation](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-instrumentation) package.

```js
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { SocketIoInstrumentation } = require('opentelemetry-instrumentation-socket.io);

registerInstrumentations({
  tracerProvider,
  instrumentations: [
    new SocketIoInstrumentation({
      // see under for available configuration
    })
  ]
});
```

### socket.io Instrumentation Options

socket.io instrumentation has few options available to choose from. You can set the following:

| Options        | Type                                   | Description                                                                                     |
| -------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `emitHook` | `SocketIoHookFunction` | hook for adding custom attributes before socket.io emits the event |
| `emitIgnoreEventList` | `string[]` | names of emitted events to ignore tracing for |
| `onHook` | `SocketIoHookFunction` | hook for adding custom attributes before the event listener (callback) is invoked |
| `onIgnoreEventList` | `string[]` | names of listened events to ignore tracing for |
| `traceReserved` | `boolean` | set to true if you want to trace socket.io reserved events (see https://socket.io/docs/v4/emit-cheatsheet/#Reserved-events) |
| `filterHttpTransport`| `HttpTransportInstrumentationConfig` | set if you want to filter out the HTTP traces when using HTTP polling as the transport (see below)

#### HttpTransportInstrumentationConfig
If you use `opentelemetry-instrumentation-socket.io` alongside `instrumentation-http`, socket.io might use HTTP polling as the transport method. Therefore, you will see an HTTP span created as the parent of the socket.io span. 
To filter out those spans; we use HttpTransportInstrumentationConfig.

`HttpTransportInstrumentationConfig` has a few options available to choose from. You can set the following:

| Options        | Type                                   | Description                                                                                     |
| -------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `httpInstrumentation`| `HttpInstrumentation` | the instance of HttpInstrumentation you pass to `registerInstrumentations`|
| `socketPath` | `string` | the socket.io endpoint path (defaults to `/socket.io/`) |
---

This extension (and many others) was developed by [Aspecto](https://www.aspecto.io/) with ❤️

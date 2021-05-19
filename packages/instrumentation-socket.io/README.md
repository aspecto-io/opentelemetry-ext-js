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
const { NodeTracerProvider } = require('@opentelemetry/node');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { SocketIoInstrumentation } = require('opentelemetry-instrumentation-socket.io);

registerInstrumentations({
  traceProvider,
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
| `onHook` | `SocketIoHookFunction` | hook for adding custom attributes before the event listener (callback) is invoked |
| `traceReserved` | `boolean` | set to true if you want to trace socket.io reserved events (see https://socket.io/docs/v4/emit-cheatsheet/#Reserved-events) |
| `filterTransport` | `TransportInstrumentationConfig` | WIP set to TransportInstrumentationConfig if you want to filter out socket.io HTTP transport |
---

This extension (and many others) was developed by [Aspecto](https://www.aspecto.io/) with ❤️

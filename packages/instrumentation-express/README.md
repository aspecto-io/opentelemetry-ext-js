# OpenTelemetry express Instrumentation for Node.js
[![NPM version](https://img.shields.io/npm/v/opentelemetry-instrumentation-express.svg)](https://www.npmjs.com/package/opentelemetry-instrumentation-express)

This module provide enhanced instrumentation for the `express` web framework.

## Installation

```
npm install --save opentelemetry-instrumentation-express
```
## Supported Versions
This instrumentation supports `^4.9.0`:

all versions >= `4.9.0` (released 2014) and < `5.0.0` (in alpha).

## Usage
For further automatic instrumentation instruction see the [@opentelemetry/instrumentation](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-instrumentation) package.

```js
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { ExpressInstrumentation } = require('opentelemetry-instrumentation-express');

const tracerProvider = new NodeTracerProvider();
tracerProvider.register();

registerInstrumentations({
  tracerProvider,
  instrumentations: [
    new ExpressInstrumentation()
  ]
});
```

### Express Instrumentation Options

Express instrumentation has few options available to choose from. You can set the following:

| Options | Type  | Description |
| --- | --- | --- |
| `requestHook` | `RequestHook` (function) | Hook for adding custom attributes before express start handling the request. Receives params: `span, { moduleVersion, req, res }` |
| `includeHttpAttributes` | `boolean` | If set to true, plugin will include semantic http attributes in each express span |

## Semantic Behavior
Express auto instrumentation will create a single span per request with the following attributes.
Detailed specification and cases can be found [here](./doc/attributes-specification.MD).

### `http.route`
This is a conventional http attribute, which is collected by express instead of the http module (which is not aware of the route). It will always contain path-parameterized data with low cardinality (no ids), but might be missing parts of the path in case of early termination or middlewares that accept any path.

Example: `/api/users/:id`

### `express.route.full`
This attribute will always contain the entire path. The part of the path that has been consumed by express will be shown as is (parameterized), and the leftover will be concatenated after (due to early termination or middleware that accept any path).

Example: `/api/users/:id/books/758734` (The `:id` part was consumed, but the `bookid` part was not).

### `express.route.configured`
This attribute is relevant when user configures multi path options for the same middleware. It reduces even further the cardinality space compared to `http.route`, and supply more info about how the app routing works.

Example: `/api["/foo", /"bar"]` - meaning that the same endpoint is triggered by routes `/api/foo` and `/api/bar`.

### `express.route.params`
This attribute holds a json stringified map, where the keys are the url path param names, and the values are the matched params from the actual url.

Example: `{"id":"1234"}`. 

### `express.unhandled`
Set to true when request was not handled by any middleware in express, and got fallback to the default app `finalhandler`. This can happen if client sent request with invalid path or method (resulting in 404). This can be useful to filter out requests from internet bots which try to call common routes on servers.

### `express.instrumentation.errors`
In case of internal error in instrumentation, this attribute will contain the error description. There are no known valid use cases which are expected to produce this attribute.

## Difference from [@opentelemetry/instrumentation-express](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-express)

* This instrumentation is focusing on extracting the most accurate and complete `route` data, in any valid express edge case. Contrib instrumentation does a good job for common cases, but miss nuances on complex setups.
* This instrumentation create a single span per request. Contrib instrumentation creates span per express Router/Route, which can be useful to observe express internal components, with the cost of more spans in each trace.
* Set few alternatives for route attribute, each with different level of cardinality vs accuracy.
* Allows to set `requestHook` for adding custom attributes to span, as well as ability to capture express version into user defined attribute.
* Distinguish between handled requests (ended from user middleware), and unhandled (terminated from express built in 'finalhandler').
* Option to conform with the [Semantic conventions for HTTP spans](https://github.com/open-telemetry/opentelemetry-specification/blob/master/specification/trace/semantic_conventions/http.md).


---

This extension (and many others) was developed by [Aspecto](https://www.aspecto.io/) with ❤️
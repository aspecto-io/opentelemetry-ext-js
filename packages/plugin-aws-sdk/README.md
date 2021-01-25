# OpenTelemetry aws-sdk Instrumentation for Node.js
[![NPM version](https://img.shields.io/npm/v/opentelemetry-plugin-aws-sdk.svg)](https://www.npmjs.com/package/opentelemetry-plugin-aws-sdk)

This module provides automatic instrumentation for [`aws-sdk`](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/).

## Installation

```
npm install --save opentelemetry-plugin-aws-sdk
```

## Usage

To load this plugin, specify it in the Node Tracer's configuration:

```js
const { NodeTracerProvider } = require("@opentelemetry/node");

const provider = new NodeTracerProvider({
  plugins: {
    "aws-sdk": {
      enabled: true,
      // You may use a package name or absolute path to the file.
      path: "opentelemetry-plugin-aws-sdk",
    },
  },
});
```

### aws-sdk Plugin Options

aws-sdk plugin has few options available to choose from. You can set the following:

| Options        | Type                                   | Description                                                                                     |
| -------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `preRequestHook` | `AwsSdkRequestCustomAttributeFunction` | Hook called before request send, which allow to add custom attributes to span. |
| `responseHook` | `AwsSdkResponseCustomAttributeFunction` | Hook for adding custom attributes when response is received from aws. |
| `sqsProcessHook` | `AwsSdkSqsProcessCustomAttributeFunction` | Hook called after starting sqs `process` span (for each sqs received message), which allow to add custom attributes to it. |
| `suppressUnderlyingInstrumentation` | boolean | Most aws operation use http request under the hood. If http instrumentation is enabled, each aws operation will also create an http/s child describing the communication with amazon servers. Setting the suppressUnderlyingInstrumentation` config value to `true` will cause the plugin to suppress instrumentation of underlying operations, effectively causing those http spans to be non-recordable. |



## Span Attributes
This plugin patch the internal `Request` object, which means that each sdk operation will create a single span with attributes from 3 sources:

### Default attributes
Each span will have the following attributes:
| Attribute Name | Type | Description | Example |
| -------------- | ---- | ----------- | ------- |
| `component` | string | Always equals "aws-sdk" | "aws-sdk" |
| `aws.operation` | string | The method name for the request. | for `SQS.sendMessage(...)` the operation is "sendMessage" |
| `aws.signature.version` | string | AWS version of authentication signature on the request. | "v4" |
| `aws.region` | string | Region name for the request | "eu-west-1" |
| `aws.service.api` | string | The sdk class name for the service | "SQS" |
| `aws.service.identifier` | string | Identifier for the service in the sdk | "sqs" |
| `aws.service.name` | string | Abbreviation name for the service | "Amazon SQS" |
| `aws.request.id` | uuid | Request unique id, as returned from aws on response | "01234567-89ab-cdef-0123-456789abcdef" |
| `aws.error` | string | information about a service or networking error, as returned from AWS | "UriParameterError: Expected uri parameter to have length >= 1, but found "" for params.Bucket" |

### Custom User Attributes
The plugin user can configure a `preRequestHook` function which will be called before each request, with the request object and the corrosponding span.  
This hook can be used to add custom attributes to the span with any logic.  
For example, user can add interesting attributes from the `request.params`, and write custom logic based on the service and operation.
Usage example:
```js
awsPluginConfig = {
  enabled: true,
  path: "opentelemetry-plugin-aws-sdk",
  preRequestHook: (span, request) => {
    if (span.attributes["aws.service.api"] === 's3') {
      span.setAttribute("s3.bucket.name", request.params["Bucket"]);
    }
  }
};
```

### Specific Service Logic
AWS contains dozens of services accessible with the JS SDK. For many services, the default attributes specified above are enough, but other services have specific [trace semantic conventions](https://github.com/open-telemetry/opentelemetry-specification/tree/master/specification/trace/semantic_conventions), or need to inject/extract intra-process context, or set intra-process context correctly.

Specific service logic currently implemented for:
* [SQS](./docs/sqs.md)

---

This plugin is a work in progress. We implemented some of the specific trace semantics for some of the services, and strive to support more services and extend the already supported services in the future. You can [Open an Issue](https://github.com/aspecto-io/opentelemetry-ext-js/issues), or [Submit a Pull Request](https://github.com/aspecto-io/opentelemetry-ext-js/pulls) if you want to contribute.

## Potential Side Effects
The plugin is doing best effort to support the trace specification of open telemetry. For SQS, it involves defining new attributes on the `Messages` array, as well as on the manipulated types generated from this array (to set correct trace context for a single SQS message operation). Those properties are defined as [non-enumerable](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Enumerability_and_ownership_of_properties) properties, so they have minimum side effect on the app. They will, however, show when using the `Object.getOwnPropertyDescriptors` and `Reflect.ownKeys` functions on SQS `Messages` array and for each `Message` in the array.

---

This extension (and many others) was developed by [Aspecto](https://www.aspecto.io/) with ❤️

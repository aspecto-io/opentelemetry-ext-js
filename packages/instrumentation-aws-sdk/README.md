# OpenTelemetry aws-sdk Instrumentation for Node.js
[![NPM version](https://img.shields.io/npm/v/opentelemetry-instrumentation-aws-sdk.svg)](https://www.npmjs.com/package/opentelemetry-instrumentation-aws-sdk)

This module provides automatic instrumentation for [`aws-sdk`](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/).

## Installation

```
npm install --save opentelemetry-instrumentation-aws-sdk
```

## Usage
For further automatic instrumentation instruction see the [@opentelemetry/instrumentation](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-instrumentation) package.

```js
const { NodeTracerProvider } = require('@opentelemetry/node');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { AwsInstrumentation } = require('opentelemetry-instrumentation-aws-sdk');

const traceProvider = new NodeTracerProvider({
  // be sure to disable old plugin
  plugins: {
    'aws-sdk': { enabled: false, path: 'opentelemetry-plugin-aws-sdk' }
  }
});

registerInstrumentations({
  traceProvider,
  instrumentations: [
    new AwsInstrumentation({
      // see under for available configuration
    })
  ]
});
```

### aws-sdk Instrumentation Options

aws-sdk instrumentation has few options available to choose from. You can set the following:

| Options        | Type                                   | Description                                                                                     |
| -------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `preRequestHook` | `AwsSdkRequestCustomAttributeFunction` | Hook called before request send, which allow to add custom attributes to span. |
| `responseHook` | `AwsSdkResponseCustomAttributeFunction` | Hook for adding custom attributes when response is received from aws. |
| `sqsProcessHook` | `AwsSdkSqsProcessCustomAttributeFunction` | Hook called after starting sqs `process` span (for each sqs received message), which allow to add custom attributes to it. |
| `suppressInternalInstrumentation` | boolean | Most aws operation use http requests under the hood. Set this to `true` to hide all underlying http spans. |
| `moduleVersionAttributeName` | string | If passed, a span attribute will be added to all spans with key of the provided `moduleVersionAttributeName` and value of the patched module version |



## Span Attributes
This instrumentation patch the internal `Request` object, which means that each sdk operation will create a single span with attributes from 3 sources:

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
The instrumentation user can configure a `preRequestHook` function which will be called before each request, with the request object and the corresponding span.  
This hook can be used to add custom attributes to the span with any logic.  
For example, user can add interesting attributes from the `request.params`, and write custom logic based on the service and operation.
Usage example:
```js
awsInstrumentationConfig = {
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

This instrumentation is a work in progress. We implemented some of the specific trace semantics for some of the services, and strive to support more services and extend the already supported services in the future. You can [Open an Issue](https://github.com/aspecto-io/opentelemetry-ext-js/issues), or [Submit a Pull Request](https://github.com/aspecto-io/opentelemetry-ext-js/pulls) if you want to contribute.

## Potential Side Effects
The instrumentation is doing best effort to support the trace specification of open telemetry. For SQS, it involves defining new attributes on the `Messages` array, as well as on the manipulated types generated from this array (to set correct trace context for a single SQS message operation). Those properties are defined as [non-enumerable](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Enumerability_and_ownership_of_properties) properties, so they have minimum side effect on the app. They will, however, show when using the `Object.getOwnPropertyDescriptors` and `Reflect.ownKeys` functions on SQS `Messages` array and for each `Message` in the array.

---

This extension (and many others) was developed by [Aspecto](https://www.aspecto.io/) with ❤️

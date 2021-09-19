# OpenTelemetry aws-sdk Instrumentation for Node.js
[![NPM version](https://img.shields.io/npm/v/opentelemetry-instrumentation-aws-sdk.svg)](https://www.npmjs.com/package/opentelemetry-instrumentation-aws-sdk)

This module provides automatic instrumentation for [`aws-sdk` v2](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/) and [`@aws-sdk` v3](https://github.com/aws/aws-sdk-js-v3)

## Installation

```
npm install --save opentelemetry-instrumentation-aws-sdk
```

## Usage
For further automatic instrumentation instruction see the [@opentelemetry/instrumentation](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-instrumentation) package.

```js
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
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
| `suppressInternalInstrumentation` | `boolean` | Most aws operation use http requests under the hood. Set this to `true` to hide all underlying http spans. |
| `moduleVersionAttributeName` | `string` | If passed, a span attribute will be added to all spans with key of the provided `moduleVersionAttributeName` and value of the patched module version |



## Span Attributes
Both V2 and V3 instrumentations are collecting the following attributes:
| Attribute Name | Type | Description | Example |
| -------------- | ---- | ----------- | ------- |
| `rpc.system` | string | Always equals "aws-api" | 
| `rpc.method` | string | he name of the operation corresponding to the request, as returned by the AWS SDK. If the SDK does not provide a way to retrieve a name, the name of the command SHOULD be used, removing the suffix `Command` if present, resulting in a PascalCase name with no spaces. | `PutObject` |
| `rpc.service` | string | The name of the service to which a request is made, as returned by the AWS SDK. If the SDK does not provide a away to retrieve a name, the name of the SDK's client interface for a service SHOULD be used, removing the suffix `Client` if present, resulting in a PascalCase name with no spaces. | `S3`, `DynamoDB`, `Route53` |
| `aws.region` | string | Region name for the request | "eu-west-1" |

### V2 attributes
In addition to the above attributes, the instrumentation also collect the following for V2 ONLY:
| Attribute Name | Type | Description | Example |
| -------------- | ---- | ----------- | ------- |
| `aws.operation` | string | The method name for the request. | for `SQS.sendMessage(...)` the operation is "sendMessage" |
| `aws.signature.version` | string | AWS version of authentication signature on the request. | "v4" |
| `aws.service.api` | string | The sdk class name for the service | "SQS" |
| `aws.service.identifier` | string | Identifier for the service in the sdk | "sqs" |
| `aws.service.name` | string | Abbreviation name for the service | "Amazon SQS" |
| `aws.request.id` | uuid | Request unique id, as returned from aws on response | "01234567-89ab-cdef-0123-456789abcdef" |
| `aws.error` | string | information about a service or networking error, as returned from AWS | "UriParameterError: Expected uri parameter to have length >= 1, but found "" for params.Bucket" |

### Custom User Attributes
The instrumentation user can configure a `preRequestHook` function which will be called before each request, with a normalized request object (across v2 and v3) and the corresponding span.  
This hook can be used to add custom attributes to the span with any logic.  
For example, user can add interesting attributes from the `request.params`, and write custom logic based on the service and operation.
Usage example:
```js
awsInstrumentationConfig = {
  preRequestHook: (span, request) => {
    if (span.serviceName === 's3') {
      span.setAttribute("s3.bucket.name", request.commandInput["Bucket"]);
    }
  }
};
```

### Specific Service Logic
AWS contains dozens of services accessible with the JS SDK. For many services, the default attributes specified above are enough, but other services have specific [trace semantic conventions](https://github.com/open-telemetry/opentelemetry-specification/tree/master/specification/trace/semantic_conventions), or need to inject/extract intra-process context, or set intra-process context correctly.

Specific service logic currently implemented for:
* [SQS](./docs/sqs.md)
* DynamoDb

---

This instrumentation is a work in progress. We implemented some of the specific trace semantics for some of the services, and strive to support more services and extend the already supported services in the future. You can [Open an Issue](https://github.com/aspecto-io/opentelemetry-ext-js/issues), or [Submit a Pull Request](https://github.com/aspecto-io/opentelemetry-ext-js/pulls) if you want to contribute.

## Potential Side Effects
The instrumentation is doing best effort to support the trace specification of open telemetry. For SQS, it involves defining new attributes on the `Messages` array, as well as on the manipulated types generated from this array (to set correct trace context for a single SQS message operation). Those properties are defined as [non-enumerable](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Enumerability_and_ownership_of_properties) properties, so they have minimum side effect on the app. They will, however, show when using the `Object.getOwnPropertyDescriptors` and `Reflect.ownKeys` functions on SQS `Messages` array and for each `Message` in the array.

---

This extension (and many others) was developed by [Aspecto](https://www.aspecto.io/) with ❤️

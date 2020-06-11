# OpenTelemetry aws-sdk Instrumentation for Node.js

This module provides automatic instrumentation for [`aws-sdk`](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/).

## Installation

```
npm install --save opentelemetry-plugin-aws-sdk
```

## Usage

To load a specific plugin (**aws-sdk** in this case), specify it in the Node Tracer's configuration

```js
const { NodeTracerProvider } = require("opentelemetry-plugin-aws-sdk");

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
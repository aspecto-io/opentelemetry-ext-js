# OpenTelemetry TypeORM Instrumentation for Node.js

This module provides automatic instrumentation for [`TypeORM`](https://typeorm.io/).

## Installation

```
npm install --save opentelemetry-plugin-typeorm
```

## Usage

To load a specific plugin (**typeorm** in this case), specify it in the Node Tracer's configuration

```js
const { NodeTracerProvider } = require("opentelemetry-plugin-typeorm");

const provider = new NodeTracerProvider({
  plugins: {
    typeorm: {
      enabled: true,
      // You may use a package name or absolute path to the file.
      path: "opentelemetry-plugin-typeorm",
    },
  },
});
```

### TypeORM Plugin Options

TypeORM plugin has few options available to choose from. You can set the following:

| Options        | Type                                   | Description                                                                                     |
| -------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `responseHook` | `TypeormResponseCustomAttributesFunction` | Hook called statement response is returned, which allows to add custom attributes to span.      |

---

This extension (and many others) was developed by [Aspecto](https://www.aspecto.io/) with ❤️

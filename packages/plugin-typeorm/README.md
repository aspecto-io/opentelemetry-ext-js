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
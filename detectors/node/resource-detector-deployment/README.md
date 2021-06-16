# OpenTelemetry Deployment Resource Detector for Node.js
[![NPM version](https://img.shields.io/npm/v/opentelemetry-resource-detector-deployment.svg)](https://www.npmjs.com/package/opentelemetry-resource-detector-deployment)

This module provides automatic resource detector for [Deployment](https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/resource/semantic_conventions/deployment_environment.md)

## Installation

```bash
npm install --save opentelemetry-resource-detector-deployment
```

##  Usage

### Synchronous SDK Initialization
```js
import { detectSyncResources } from 'opentelemetry-resource-detector-sync-api';
import { deploymentSyncDetector } from 'opentelemetry-resource-detector-deployment';

const resource = detectSyncResources({
    detectors: [deploymentSyncDetector, /* add other sync detectors here */],
});
const tracerProvider = new NodeTracerProvider({ resource });
```

### Asynchronous SDK Initialization
```js
import { detectResources } from '@opentelemetry/resources';
import { deploymentDetector } from 'opentelemetry-resource-detector-deployment';

( async () => {
    const resource = await detectResources({
        detectors: [deploymentDetector, /* add other async detectors here */],
    });
    const tracerProvider = new NodeTracerProvider({ resource });
    // Initialize auto instrumentation plugins and register provider.
    // Make sure you don't 'require' instrumented packages elsewhere 
    // before they are registered here
})();
```

## Attributes
| Attribute | Type | Source |
| --- | --- | --- |
| `deployment.environment` | string | `process.env.NODE_ENV` |

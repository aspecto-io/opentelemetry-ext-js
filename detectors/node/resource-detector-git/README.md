# OpenTelemetry Service Resource Detector for Node.js
[![NPM version](https://img.shields.io/npm/v/opentelemetry-resource-detector-git.svg)](https://www.npmjs.com/package/opentelemetry-resource-detector-git)

This module provides automatic resource detector for Git Version Control System. This resource is not part of [open telemetry semantic conventions specification for resources](https://github.com/open-telemetry/opentelemetry-specification/tree/main/specification/resource/semantic_conventions).

The detector is doing best effort to extract git info, including these cases:
- Git info from common CI environment variables.
- Docker environment where `.git` db is present (copied to image or mounted into the container) but `git` cli is not installed on the image.
- Docker environment where `.git` db is missing, but node_modules is copied to image from source environment where `.git` db was available

## Installation

```bash
npm install --save opentelemetry-resource-detector-git
```

##  Usage

### Synchronous SDK Initialization
```js
import { detectSyncResources } from 'opentelemetry-resource-detector-sync-api';
import { gitSyncDetector } from 'opentelemetry-resource-detector-git';

const resource = detectSyncResources({
    detectors: [gitSyncDetector, /* add other sync detectors here */],
});
const tracerProvider = new NodeTracerProvider({ resource });
```

### Asynchronous SDK Initialization
```js
import { detectResources } from '@opentelemetry/resources';
import { gitDetector } from 'opentelemetry-resource-detector-git';

( async () => {
    const resource = await detectResources({
        detectors: [gitDetector, /* add other async detectors here */],
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
| `vcs.system` | string | If this repo is identified as git repo, this attribute will be set to constant value 'git' |
| `vcs.commit.id` | [string (full SHA-1 object name)](https://git-scm.com/docs/gitrevisions#Documentation/gitrevisions.txt-emltsha1gtemegemdae86e1950b1277e545cee180551750029cfe735ememdae86eem) | sha-1 of the current git HEAD. This value uniquely identifies the git commit of the codebase |
| `vcs.clone.id` | [string (v4 UUID)](https://en.wikipedia.org/wiki/Universally_unique_identifier#Version_4_(random)) | Unique id for the clone of the git repo |
| `vcs.branch.name` | string | name of the current active branch |

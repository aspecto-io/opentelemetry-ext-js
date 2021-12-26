# OpenTelemetry Propagator Selective for Node.js
[![NPM version](https://img.shields.io/npm/v/opentelemetry-propagator-selective.svg)](https://www.npmjs.com/package/opentelemetry-propagator-selective)

This module provides [TextMapPropagator](https://github.com/open-telemetry/opentelemetry-js-api/blob/80d617b1f2a6807a11497951d1c63daf6a5fe705/src/propagation/TextMapPropagator.ts#L30) which wraps another propagator and apply inject and extract selectively according to configuration. 

## Installation

```bash
npm install --save opentelemetry-propagator-selective
```

##  Usage
Example usage with [B3 Propagator](https://www.npmjs.com/package/@opentelemetry/propagator-b3)

```ts
import { SelectivePropagator } from 'opentelemetry-propagator-selective';
import { B3Propagator } from '@opentelemetry/propagator-b3';
import { propagation } from '@opentelemetry/api';

const b3ExtractOnly = new SelectivePropagator(new B3Propagator(), { extractEnabled: true, injectEnabled: false});
propagation.setGlobalPropagator(b3ExtractOnly);
```

You can use any propagator compatible with the `TextMapPropagator` interface.

## Configuration
- You can set `extractEnabled` and `injectEnabled` to boolean values to set which operations are valid. 
- It is possible to set both to true or both to false. 
- If not set, default is to not `inject` / `extract`


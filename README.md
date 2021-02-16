# opentelemetry-ext-js

<p>
    <a href="https://github.com/aspecto-io/opentelemetry-ext-js/actions?query=workflow%3ABuild">
        <img alt="Build" src="https://github.com/aspecto-io/opentelemetry-ext-js/workflows/Build/badge.svg">
    </a>
    <a href="https://github.com/aspecto-io/opentelemetry-ext-js/blob/master/LICENSE">
        <img alt="license" src="https://img.shields.io/badge/license-Apache_2.0-green.svg?">
    </a>    
        <a href="http://makeapullrequest.com">
        <img alt="license" src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg">
    </a>    
</p>

js extensions for the [open-telemetry](https://opentelemetry.io/) project, from [Aspecto](https://www.aspecto.io/) with :heart:

**Compatible with [otel v0.15.0](https://github.com/open-telemetry/opentelemetry-js/releases/tag/v0.15.0)**
## Instrumentations
- [opentelemetry-instrumentation-kafkajs](./packages/instrumentation-kafkajs) - auto instrumentation for [`kafkajs`](https://kafka.js.org) [![NPM version](https://img.shields.io/npm/v/opentelemetry-instrumentation-kafkajs.svg)](https://www.npmjs.com/package/opentelemetry-instrumentation-kafkajs)
- [opentelemetry-instrumentation-aws-sdk](./packages/instrumentation-aws-sdk) - auto instrumentation for [`aws-sdk`](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/) [![NPM version](https://img.shields.io/npm/v/opentelemetry-instrumentation-aws-sdk.svg)](https://www.npmjs.com/package/opentelemetry-instrumentation-aws-sdk)
- [opentelemetry-instrumentation-typeorm](./packages/instrumentation-typeorm) - auto instrumentation for [`TypeORM`](https://typeorm.io/) [![NPM version](https://img.shields.io/npm/v/opentelemetry-instrumentation-typeorm.svg)](https://www.npmjs.com/package/opentelemetry-instrumentation-typeorm)
- [opentelemetry-instrumentation-sequelize](./packages/instrumentation-sequelize) - auto instrumentation for [`Sequelize`](https://sequelize.org/) 
[![NPM version](https://img.shields.io/npm/v/opentelemetry-instrumentation-sequelize.svg)](https://www.npmjs.com/package/opentelemetry-instrumentation-sequelize)
- [opentelemetry-instrumentation-mongoose](./packages/instrumentation-mongoose) - auto instrumentation for [`mongoose`](https://mongoosejs.com/) 
[![NPM version](https://img.shields.io/npm/v/opentelemetry-instrumentation-mongoose.svg)](https://www.npmjs.com/package/opentelemetry-instrumentation-mongoose)

## Compatibility with opentelemetry versions
### Instrumentations in this repo are using opentelemetry [Instrumentation API](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-instrumentation).
For documentation using with the old [plugin](https://github.com/open-telemetry/opentelemetry-js/blob/main/packages/opentelemetry-core/src/trace/Plugin.ts) api, please go [here](https://github.com/aspecto-io/opentelemetry-ext-js/tree/4393fff108c477d05ecd02dd7d9552ea1d482853).

**Tested and verified against otel v0.15.0**
- Versions 0.0.x of the instrumentations are compatible with otel version v0.15.0
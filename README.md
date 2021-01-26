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

## Plugins
- [opentelemetry-plugin-kafkajs](./packages/plugin-kafkajs) - auto instrumentation for [`kafkajs`](https://kafka.js.org) [![NPM version](https://img.shields.io/npm/v/opentelemetry-plugin-kafkajs.svg)](https://www.npmjs.com/package/opentelemetry-plugin-kafkajs)
- [opentelemetry-plugin-aws-sdk](./packages/plugin-aws-sdk) - auto instrumentation for [`aws-sdk`](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/) [![NPM version](https://img.shields.io/npm/v/opentelemetry-plugin-aws-sdk.svg)](https://www.npmjs.com/package/opentelemetry-plugin-aws-sdk)
- [opentelemetry-plugin-typeorm](./packages/plugin-typeorm) - auto instrumentation for [`TypeORM`](https://typeorm.io/) [![NPM version](https://img.shields.io/npm/v/opentelemetry-plugin-typeorm.svg)](https://www.npmjs.com/package/opentelemetry-plugin-typeorm)
- [opentelemetry-plugin-sequelize](./packages/plugin-sequelize) - auto instrumentation for [`Sequelize`](https://sequelize.org/) 
[![NPM version](https://img.shields.io/npm/v/opentelemetry-plugin-sequelize.svg)](https://www.npmjs.com/package/opentelemetry-plugin-sequelize)

## Compatibility with OTEL SDK
**Tested and verified against otel v0.14.0**
- Support for otel v0.15.0, which had few breaking change not compatible with current implementation will be added soon
- Versions 0.1.x of the plugins are compatible with otel version v0.14.0
- Versions 0.0.x of the plugins are compatible with otel version v0.12.0

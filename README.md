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

<p>
  <strong>
    <a href="doc/conventions.md">Conventions<a/>
    &nbsp;&nbsp;&bull;&nbsp;&nbsp;
    <a href="doc/development-guide.md">Development Guide<a/>
  </strong>
</p>

---

js extensions for the [open-telemetry](https://opentelemetry.io/) project, from [Aspecto](https://www.aspecto.io/) with :heart:

The instrumentations in this repo are:
- vendor neutral
- strictly complies with [open telemetry semantic conventions](https://github.com/open-telemetry/opentelemetry-specification/tree/main/specification/trace/semantic_conventions)
- up to date with latest SDK version

**Compatible with [SDK v0.19.0](https://github.com/open-telemetry/opentelemetry-js/releases/tag/v0.19.0)**
## Instrumentations
| Instrumentation Package | Instrumented Lib | NPM |
| --- | --- | --- |
| [opentelemetry-instrumentation-kafkajs](./packages/instrumentation-kafkajs) | [`kafkajs`](https://kafka.js.org) | [![NPM version](https://img.shields.io/npm/v/opentelemetry-instrumentation-kafkajs.svg)](https://www.npmjs.com/package/opentelemetry-instrumentation-kafkajs) |
| [opentelemetry-instrumentation-aws-sdk](./packages/instrumentation-aws-sdk) | [`aws-sdk`](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/) | [![NPM version](https://img.shields.io/npm/v/opentelemetry-instrumentation-aws-sdk.svg)](https://www.npmjs.com/package/opentelemetry-instrumentation-aws-sdk)
| [opentelemetry-instrumentation-typeorm](./packages/instrumentation-typeorm) | [`TypeORM`](https://typeorm.io/) | [![NPM version](https://img.shields.io/npm/v/opentelemetry-instrumentation-typeorm.svg)](https://www.npmjs.com/package/opentelemetry-instrumentation-typeorm) |
| [opentelemetry-instrumentation-sequelize](./packages/instrumentation-sequelize) | [`Sequelize`](https://sequelize.org/) | [![NPM version](https://img.shields.io/npm/v/opentelemetry-instrumentation-sequelize.svg)](https://www.npmjs.com/package/opentelemetry-instrumentation-sequelize) |
| [opentelemetry-instrumentation-mongoose](./packages/instrumentation-mongoose) | [`mongoose`](https://mongoosejs.com/) | [![NPM version](https://img.shields.io/npm/v/opentelemetry-instrumentation-mongoose.svg)](https://www.npmjs.com/package/opentelemetry-instrumentation-mongoose) |
| [opentelemetry-instrumentation-elasticsearch](./packages/instrumentation-elasticsearch) | [`@elastic/elasticsearch`](https://www.npmjs.com/package/@elastic/elasticsearch) | [![NPM version](https://img.shields.io/npm/v/opentelemetry-instrumentation-elasticsearch.svg)](https://www.npmjs.com/package/opentelemetry-instrumentation-elasticsearch) |
| [opentelemetry-instrumentation-neo4j](./packages/instrumentation-neo4j) | [`neo4j-driver`](https://github.com/neo4j/neo4j-javascript-driver/) | [![NPM version](https://img.shields.io/npm/v/opentelemetry-instrumentation-neo4j.svg)](https://www.npmjs.com/package/opentelemetry-instrumentation-neo4j) |
| [opentelemetry-instrumentation-amqplib](./packages/instrumentation-amqplib) | [`amqplib`](https://github.com/squaremo/amqp.node) (RabbitMQ) | [![NPM version](https://img.shields.io/npm/v/opentelemetry-instrumentation-amqplib.svg)](https://www.npmjs.com/package/opentelemetry-instrumentation-amqplib) | 
| [opentelemetry-instrumentation-express](./packages/instrumentation-express) | [`express`](https://github.com/expressjs/express) | [![NPM version](https://img.shields.io/npm/v/opentelemetry-instrumentation-express.svg)](https://www.npmjs.com/package/opentelemetry-instrumentation-express) |


## Compatability Table
**Tested and verified against otel v0.19.0**

| Instrumentations Version | OpenTelemetry Version |
| --- | --- |
| 0.4.x | 0.19.0 |
| 0.3.x | 0.18.0 |
| 0.2.x | 0.17.0 |
| 0.1.x | 0.16.0 |
| 0.0.x | 0.15.0 |

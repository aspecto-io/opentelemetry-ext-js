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
    <a href="doc/conventions.md">Conventions</a>
    &nbsp;&nbsp;&bull;&nbsp;&nbsp;
    <a href="doc/development-guide.md">Development Guide</a>
  </strong>
</p>

---

js extensions for the [open-telemetry](https://opentelemetry.io/) project, from [Aspecto](https://www.aspecto.io/) with :heart:

The instrumentations in this repo are:
- vendor neutral
- strictly complies with [open telemetry semantic conventions](https://github.com/open-telemetry/opentelemetry-specification/tree/main/specification/trace/semantic_conventions)
- up to date with latest SDK version

**Compatible with [SDK stable ^1.0.0](https://github.com/open-telemetry/opentelemetry-js/tree/stable/v1.0.0) and [SDK experimental ^0.28.0](https://github.com/open-telemetry/opentelemetry-js/tree/v0.28.0/experimental/packages)**
## Instrumentations
| Instrumentation Package | Instrumented Lib | NPM |
| --- | --- | --- |
| [opentelemetry-instrumentation-kafkajs](./packages/instrumentation-kafkajs) | [`kafkajs`](https://kafka.js.org) | [![NPM version](https://img.shields.io/npm/v/opentelemetry-instrumentation-kafkajs.svg)](https://www.npmjs.com/package/opentelemetry-instrumentation-kafkajs) [![kafka-js downloads](https://img.shields.io/npm/dm/opentelemetry-instrumentation-kafkajs.svg)]()|
| opentelemetry-instrumentation-aws-sdk | [`aws-sdk`](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/) | Deprecated in favor of [@opentelemetry/instrumentation-aws-sdk](https://www.npmjs.com/package/@opentelemetry/instrumentation-aws-sdk) 
| [opentelemetry-instrumentation-typeorm](./packages/instrumentation-typeorm) | [`TypeORM`](https://typeorm.io/) | [![NPM version](https://img.shields.io/npm/v/opentelemetry-instrumentation-typeorm.svg)](https://www.npmjs.com/package/opentelemetry-instrumentation-typeorm) [![typeorm downloads](https://img.shields.io/npm/dm/opentelemetry-instrumentation-typeorm.svg)]() |
| [opentelemetry-instrumentation-sequelize](./packages/instrumentation-sequelize) | [`Sequelize`](https://sequelize.org/) | [![NPM version](https://img.shields.io/npm/v/opentelemetry-instrumentation-sequelize.svg)](https://www.npmjs.com/package/opentelemetry-instrumentation-sequelize) [![sequelize downloads](https://img.shields.io/npm/dm/opentelemetry-instrumentation-sequelize.svg)]() |
| [opentelemetry-instrumentation-mongoose](./packages/instrumentation-mongoose) | [`mongoose`](https://mongoosejs.com/) | [![NPM version](https://img.shields.io/npm/v/opentelemetry-instrumentation-mongoose.svg)](https://www.npmjs.com/package/opentelemetry-instrumentation-mongoose) [![mongoose downloads](https://img.shields.io/npm/dm/opentelemetry-instrumentation-mongoose.svg)]() |
| [opentelemetry-instrumentation-elasticsearch](./packages/instrumentation-elasticsearch) | [`@elastic/elasticsearch`](https://www.npmjs.com/package/@elastic/elasticsearch) | [![NPM version](https://img.shields.io/npm/v/opentelemetry-instrumentation-elasticsearch.svg)](https://www.npmjs.com/package/opentelemetry-instrumentation-elasticsearch) [![elasticsearch downloads](https://img.shields.io/npm/dm/opentelemetry-instrumentation-elasticsearch.svg)]() |
| [opentelemetry-instrumentation-neo4j](./packages/instrumentation-neo4j) | [`neo4j-driver`](https://github.com/neo4j/neo4j-javascript-driver/) | [![NPM version](https://img.shields.io/npm/v/opentelemetry-instrumentation-neo4j.svg)](https://www.npmjs.com/package/opentelemetry-instrumentation-neo4j) [![neo4j downloads](https://img.shields.io/npm/dm/opentelemetry-instrumentation-neo4j.svg)]() |
| opentelemetry-instrumentation-amqplib | [`amqplib`](https://github.com/squaremo/amqp.node) (RabbitMQ) | Deprecated in favor of [@opentelemetry/instrumentation-amqplib](https://www.npmjs.com/package/@opentelemetry/instrumentation-amqplib) | 
| [opentelemetry-instrumentation-express](./packages/instrumentation-express) | [`express`](https://github.com/expressjs/express) | [![NPM version](https://img.shields.io/npm/v/opentelemetry-instrumentation-express.svg)](https://www.npmjs.com/package/opentelemetry-instrumentation-express) [![express downloads](https://img.shields.io/npm/dm/opentelemetry-instrumentation-express.svg)]() |
|[opentelemetry-instrumentation-socket.io](./packages/instrumentation-socket.io) | [`socket.io`](https://github.com/socketio/socket.io) | [![NPM version](https://img.shields.io/npm/v/opentelemetry-instrumentation-socket.io.svg)](https://www.npmjs.com/package/opentelemetry-instrumentation-socket.io) [![socket.io downloads](https://img.shields.io/npm/dm/opentelemetry-instrumentation-socket.io.svg)]()
|[opentelemetry-instrumentation-node-cache](./packages/instrumentation-node-cache) | [`node-cache`](https://www.npmjs.com/package/node-cache) | [![NPM version](https://img.shields.io/npm/v/opentelemetry-instrumentation-node-cache.svg)](https://www.npmjs.com/package/opentelemetry-instrumentation-node-cache) [![node-cache downloads](https://img.shields.io/npm/dm/opentelemetry-instrumentation-node-cache.svg)]()


## Resource Detectors
| Detector | Synchronicity | NPM |
| --- | --- | --- |
| [Service](./detectors/node/resource-detector-service) | Synchronous | [![NPM version](https://img.shields.io/npm/v/opentelemetry-resource-detector-service.svg)](https://www.npmjs.com/package/opentelemetry-resource-detector-service) [![service detector downloads](https://img.shields.io/npm/dm/opentelemetry-resource-detector-service.svg)]() |
| [Deployment](./detectors/node/resource-detector-deployment) | Synchronous | [![NPM version](https://img.shields.io/npm/v/opentelemetry-resource-detector-deployment.svg)](https://www.npmjs.com/package/opentelemetry-resource-detector-deployment)[![deployment detector downloads](https://img.shields.io/npm/dm/opentelemetry-resource-detector-deployment.svg)]()
| [Git](./detectors/node/resource-detector-git)  | Synchronous | [![NPM version](https://img.shields.io/npm/v/opentelemetry-resource-detector-git.svg)](https://www.npmjs.com/package/opentelemetry-resource-detector-git) [![git detector downloads](https://img.shields.io/npm/dm/opentelemetry-resource-detector-git.svg)]()

## Propagators
| Propagator | Description | NPM |
| --- | --- | --- |
| [Selective](./propagators/propagator-selective) | Selective control on `inject` / `extract` enabled on another propagator | [![NPM version](https://img.shields.io/npm/v/opentelemetry-propagator-selective.svg)](https://www.npmjs.com/package/opentelemetry-propagator-selective) [![propagator selective downloads](https://img.shields.io/npm/dm/opentelemetry-propagator-selective.svg)]() |



## Compatibility Table

| Instrumentations Version | OpenTelemetry Core | OpenTelemetry Experimental | 
| --- | --- | --- |
| 0.28.x | ^1.0.0 | ^0.28.0 |
| 0.27.x | ^1.0.1 | ^0.27.0 |
| 0.26.x | ^1.0.0 | ^0.26.0 |
| 0.25.x | 0.25.0 | --- |
| 0.24.x | 0.24.0 | --- |
| 0.23.x | 0.23.0 | --- |
| 0.22.x | 0.22.0 | --- |
| 0.21.x | 0.21.0 | --- |
| 0.5.x | 0.20.0 | --- |
| 0.4.x | 0.19.0 | --- |
| 0.3.x | 0.18.0 | --- |
| 0.2.x | 0.17.0 | --- |
| 0.1.x | 0.16.0 | --- |
| 0.0.x | 0.15.0 | --- |

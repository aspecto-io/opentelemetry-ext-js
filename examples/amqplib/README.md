# amqplib-example

Demo application which demonstrate how to amqplib instrumentation, to publish and consume messages from rabbitmq.

This application is following the [RabbitMQ tutorials](https://www.rabbitmq.com/getstarted.html), with some minimal changes to work with promises and allow experimenting with few other library options. The javascript code is based on [amqp.node tutorials](https://github.com/squaremo/amqp.node/tree/main/examples/tutorials).

## Setup
To start a local RabbitMQ server: 
```
yarn docker:start
```

To run the demo application:
```
yarn start
```
This will print route map to the console, which you can use to publish and receive messages in various scenarios.


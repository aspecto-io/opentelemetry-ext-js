# opentelemetry-propagation-utils
[![NPM version](https://img.shields.io/npm/v/opentelemetry-propagation-utils.svg)](https://www.npmjs.com/package/opentelemetry-propagation-utils)

A collection of propagation utils for opentelemetry.

## Install
```sh
yarn add opentelemetry-propagation-utils
```

## Usage
### PubSub

To make sure each message handled by pubsub creates a new `process` span, and propagates to any internal operation, do as follow:

```ts
import { pubsubPropagation } from 'opentelemetry-propagation-utils';
import { Span, propagation, trace, Context } from '@opentelemetry/api';

const patch = (message: Message[], rootSpan: Span) => {
    const tracer = trace.getTracer('my-tracer');
    pubsubPropagation.patchArrayForProcessSpans(messages, tracer);

    pubsubPropagation.patchMessagesArrayToStartProcessSpans<Message>({
        messages,
        tracer,
        parentSpan: rootSpan,
        messageToSpanDetails: (message) => ({
            attributes: { ... },
            name: 'some-name',
            parentContext: propagation.extract(....) as Context
        }),
    });
}
```
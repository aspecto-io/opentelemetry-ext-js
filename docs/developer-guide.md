# Developer Guide
This guide audience is developers writing a new instrumentation, maintaining existing instrumentation, or trying to understand the architecture and design decisions of instrumentation in this repo.

It is meant to document various aspects of developing instrumentation library, based on the experiences we gained with the packages in this repo.

## Unpatching

## Configuration
Each instrumentation library should have configuration interface under `types.ts`. All the configuration parameters must be optional, and should have default value which is documented in the README.md of the package.

Supplied configuration should be merged with default configuration object so that defaults are obvious:

```js
export const DEFAULT_CONFIG: FooInstrumentationConfig = {
    barOptions: 'some default value for bar',
};

export class FooInstrumentation extends InstrumentationBase<typeof foo> {
    protected _config: FooInstrumentationConfig;

    constructor(config: FooInstrumentationConfig = {}) {
        super('opentelemetry-instrumentation-amqplib', VERSION, Object.assign({}, DEFAULT_CONFIG, config));
    }
}
```

## Holding References to Objects

## Close Span on Exception
Each span that is started should be ended. This is usually done after receiving the response for the operation.
A common error is not ending the span in case an exception was thrown (skips the code that calls `span.end()`).

You can use the `safeExecuteInTheMiddle` util from `@opentelemetry/instrumentation` for this task.

## Using Mocks vs Docker in Tests

## Utils vs Instrumentation Class

## Test All Versions
Each instrumentation must set package.json script called `test:ci` which runs [test-all-versions](https://www.npmjs.com/package/test-all-versions) on all the versions which are supported by the instrumentation.

# Checklist before submitting a PR
- [ ] Supported version range is specified
- [ ] [test-all-versions](https://www.npmjs.com/package/test-all-versions) is configured to run on `test:ci` with all supported versions.
- [ ] PR to add new instrumentation to [open telemetry registry](https://github.com/open-telemetry/opentelemetry.io)
- [ ] Verify that instrumented library is a dev dependency
- [ ] Verify you only import from it using `type`: `import type x from 'y'`. Importing directly from the instrumented library should be avoided as it will crash application if plugin is installed in instrumented app but library is not.
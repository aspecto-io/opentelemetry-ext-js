# `instrumentation-testing-utils`
Utils for testing open-telemetry instrumentation libraries

This package exports a mocah [root hook plugin](https://mochajs.org/#root-hook-plugins), which is taken care of common tasks that developer need to handle while writing unittests for instrumentations in node.

This package:
- Initializes and registering a global trace provider for tests.
- Registers a global memory exporter which can be referenced in test to access span.
- Make sure there is only a single instance of an instrumentation class that is used across different `.spec.ts` files so patching is consistent and deterministic.
- Reset the memory exporter before each test.
- Optionally - export the test traces to Jaeger for convenience while debugging and developing.

By using this package, testing instrumentation code can be shorter, and bad practices are more easily avoided.

## Supporter Version
Since [root hook plugin](https://mochajs.org/#root-hook-plugins) are used, this package is compatible to mocha v8.0.0 and above. 

## Usage
1. Add dev dependency on this package: 

```
yarn add --dev opentelemetry-instrumentation-testing-utils
```
2. `require` this package in mocha execution:

As command line argument option to mocha:
```js
    "scripts": {
        "test": "mocha --require opentelemetry-instrumentation-testing-utils",
        "test:jaeger": "OTEL_EXPORTER_JAEGER_AGENT_HOST=localhost mocha --require opentelemetry-instrumentation-testing-utils",
    },
```

Or by using config file / package.json config:
```js
    "mocha": {
        "require": [ "opentelemetry-instrumentation-mocha" ]
    }
```

3. In your `.spec` file, import `getTestSpans` and `registerInstrumentation` functions and use them to make assertions in the test:

```js
import { getTestSpans, registerInstrumentation } from 'opentelemetry-instrumentation-testing-utils';

const instrumentation = registerInstrumentation(new MyAwesomeInstrumentation());

it('some test', () => {
    // your code that generate spans for this test
    const spans: ReadableSpan[] = getTestSpans();
    // your code doing assertions with the spans array
});
```

That's it - supper short and easy.

import { Resource } from '@opentelemetry/resources';
import { ResourceAttributes } from '@opentelemetry/semantic-conventions';
import { registerInstrumentationTestingProvider } from './otel-default-provider';
import { resetMemoryExporter } from './otel-provider-api';

export * from './instrumentation-singelton';
export * from './otel-provider-api';
export * from './otel-default-provider';

export const mochaHooks = {
    beforeAll(done) {
        // since we run mocha executable, process.argv[1] will look like this:
        // ${root instrumentation package path}/node_modules/.bin/mocha
        // this is not very robust, might need to refactor in the future
        let serviceName = 'unknown_instrumentation';
        if (process.env.OTEL_SERVICE_NAME) {
            serviceName = process.env.OTEL_SERVICE_NAME;
        } else {
            try {
                serviceName = require(process.argv[1] + '/../../../package.json').name;
            } catch {}
        }
        registerInstrumentationTestingProvider({
            resource: new Resource({
                [ResourceAttributes.SERVICE_NAME]: serviceName,
            }),
        });
        done();
    },

    beforeEach(done) {
        resetMemoryExporter();
        done();
    },
};

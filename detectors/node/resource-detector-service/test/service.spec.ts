import 'mocha';
import expect from 'expect';
import { serviceDetector, serviceSyncDetector } from '../src';
import { ResourceAttributes } from '@opentelemetry/semantic-conventions';

describe('service detector', () => {
    it('read service from package json', () => {
        const resource = serviceSyncDetector.detect();
        expect(resource.attributes[ResourceAttributes.SERVICE_NAME]).toMatch('opentelemetry-resource-detector-service');
        expect(resource.attributes[ResourceAttributes.SERVICE_VERSION]).toMatch(/\d+.\d+.\d+/);
        expect(resource.attributes[ResourceAttributes.SERVICE_INSTANCE_ID]).toMatch(
            /[0-9a-f]{8}\b-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-\b[0-9a-f]{12}/
        );
    });

    it('read service from env variable', () => {
        process.env.OTEL_SERVICE_NAME = 'otel service name from env';
        const resource = serviceSyncDetector.detect();
        expect(resource.attributes[ResourceAttributes.SERVICE_NAME]).toMatch('otel service name from env');
        delete process.env.OTEL_SERVICE_NAME;
    });

    it('calling detect twice return same resource', () => {
        const resource1 = serviceSyncDetector.detect();
        const resource2 = serviceSyncDetector.detect();
        expect(resource1).toStrictEqual(resource2);
    });

    it('async version', async () => {
        const resource = await serviceDetector.detect();
        expect(resource.attributes[ResourceAttributes.SERVICE_NAME]).toMatch('opentelemetry-resource-detector-service');
        expect(resource.attributes[ResourceAttributes.SERVICE_VERSION]).toMatch(/\d+.\d+.\d+/);
        expect(resource.attributes[ResourceAttributes.SERVICE_INSTANCE_ID]).toMatch(
            /[0-9a-f]{8}\b-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-\b[0-9a-f]{12}/
        );
    });
});

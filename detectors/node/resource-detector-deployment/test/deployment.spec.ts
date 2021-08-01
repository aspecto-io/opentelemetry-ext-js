import 'mocha';
import expect from 'expect';
import { deploymentDetector, deploymentSyncDetector } from '../src';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

describe('deployment detector', () => {
    it('read deployment environment from environment variable', () => {
        process.env.NODE_ENV = 'env from testing';
        const resource = deploymentSyncDetector.detect();
        expect(resource.attributes[SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]).toMatch('env from testing');
    });

    it('no deployment environment in environment variable', () => {
        delete process.env.NODE_ENV;
        const resource = deploymentSyncDetector.detect();
        expect(resource.attributes[SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]).toBeUndefined();
    });

    it('async version', async () => {
        process.env.NODE_ENV = 'env from testing';
        const resource = await deploymentDetector.detect();
        expect(resource.attributes[SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]).toMatch('env from testing');
    });
});

import { ResourceAttributes as ResourceAttributesKeys } from '@opentelemetry/semantic-conventions';
import { Resource, defaultServiceName, ResourceAttributes } from '@opentelemetry/resources';
import { SyncDetector, syncDetectorToDetector } from 'opentelemetry-resource-detector-sync-api';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';

// set as global to make sure it's the same on any invocation even for multiple
// instances of ServiceSyncDetector
const instanceId = uuidv4();

class ServiceSyncDetector implements SyncDetector {
    detect(): Resource {
        const packageJson = this.loadJsonFile('package.json');
        const attributes: ResourceAttributes = {
            [ResourceAttributesKeys.SERVICE_INSTANCE_ID]: instanceId,
            [ResourceAttributesKeys.SERVICE_NAME]: this.getServiceName(packageJson),
        };
        const serviceVersion = packageJson?.version;
        if (serviceVersion) {
            attributes[ResourceAttributesKeys.SERVICE_VERSION] = serviceVersion;
        }
        return new Resource(attributes);
    }

    getServiceName(packageJson: any): string {
        const fromEnv = process.env.OTEL_SERVICE_NAME;
        if (fromEnv) return fromEnv;

        const fromPackageJson = packageJson?.name;
        if (fromPackageJson) return fromPackageJson;

        return defaultServiceName();
    }

    loadJsonFile(path: string): any {
        try {
            return JSON.parse(fs.readFileSync(path).toString());
        } catch (err) {
            return null;
        }
    }
}

export const serviceSyncDetector = new ServiceSyncDetector();
export const serviceDetector = syncDetectorToDetector(serviceSyncDetector);

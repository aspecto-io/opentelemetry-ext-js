import { ResourceAttributes as ResourceAttributesKeys } from "@opentelemetry/semantic-conventions";
import { Resource } from "@opentelemetry/resources";
import { SyncDetector, SyncDetectorToDetector } from 'opentelemetry-resource-detector-sync-api';

class DeploymentSyncDetector implements SyncDetector {

    detect(): Resource {
        if(process.env.NODE_ENV) {
            return new Resource({ 
                [ResourceAttributesKeys.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV,
            })
        }
        else { 
            return Resource.empty();
        }
    }

}

export const deploymentSyncDetector = new DeploymentSyncDetector();
export const deploymentDetector = SyncDetectorToDetector(deploymentSyncDetector);

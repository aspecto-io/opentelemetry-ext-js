import { Detector, Resource, ResourceDetectionConfig } from '@opentelemetry/resources';

export interface SyncDetector {
    detect(): Resource;
}

export const syncDetectorToDetector = (syncDetector: SyncDetector): Detector => {
    return {
        detect: (_config?: ResourceDetectionConfig): Promise<Resource> => Promise.resolve(syncDetector.detect()),
    };
};

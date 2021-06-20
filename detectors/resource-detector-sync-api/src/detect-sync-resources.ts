// This code is a modification of the version form SDK:
// https://github.com/open-telemetry/opentelemetry-js/blob/main/packages/opentelemetry-resources/src/platform/node/detect-resources.ts

import { diag } from '@opentelemetry/api';
import { Resource } from '@opentelemetry/resources';
import { ResourceSyncDetectionConfig } from './config';
import * as util from 'util';

/**
 * Runs all SYNC resource detectors and returns the results merged into a single
 * Resource.
 *
 * @param config Configuration for resource detection
 */
export const detectSyncResources = (config: ResourceSyncDetectionConfig = {}): Resource => {
    const internalConfig: ResourceSyncDetectionConfig = Object.assign(config);

    const resources: Array<Resource> = (internalConfig.detectors || []).map((d) => {
        try {
            const resource = d.detect();
            diag.debug(`${d.constructor.name} found resource.`, resource);
            return resource;
        } catch (e) {
            diag.debug(`${d.constructor.name} failed: ${e.message}`);
            return Resource.empty();
        }
    });

    // Future check if verbose logging is enabled issue #1903
    logResources(resources);

    return resources.reduce((acc, resource) => acc.merge(resource), Resource.empty());
};

/**
 * Writes debug information about the detected resources to the logger defined in the resource detection config, if one is provided.
 *
 * @param resources The array of {@link Resource} that should be logged. Empty entries will be ignored.
 */
const logResources = (resources: Array<Resource>) => {
    resources.forEach((resource) => {
        // Print only populated resources
        if (Object.keys(resource.attributes).length > 0) {
            const resourceDebugString = util.inspect(resource.attributes, {
                depth: 2,
                breakLength: Infinity,
                sorted: true,
                compact: false,
            });
            diag.verbose(resourceDebugString);
        }
    });
};

import { Resource, ResourceAttributes } from '@opentelemetry/resources';
import { SyncDetector, syncDetectorToDetector } from 'opentelemetry-resource-detector-sync-api';
import { GitResourceAttributes, postInstallFileName } from './types';
import { getHeadSha } from './git-sha';
import { getCloneId } from './git-clone-id';
import { getGitBranchName } from './git-branch';

class GitSyncDetector implements SyncDetector {

    detect(): Resource {
        const fromGitDb = this.createGitResourceFromGitDb();
        const fromPostInstallStamp = this.readPostInstallResource();

        // prefer to take current value from db, and fallback to post install values if available
        return fromPostInstallStamp.merge(fromGitDb);
    }

    /** Attempt to create the git resource based only on git db (not from post install stamping) */
    createGitResourceFromGitDb(): Resource {
        const gitSha = getHeadSha();
        if (!gitSha) {
            return Resource.empty();
        }

        const attributes: ResourceAttributes = {
            [GitResourceAttributes.VCS_SYSTEM]: 'git',
            [GitResourceAttributes.VCS_COMMIT_ID]: gitSha,
        };

        const cloneId = getCloneId();
        if(cloneId) {
            attributes[GitResourceAttributes.VCS_CLONE_ID] = cloneId;
        }

        const branchName = getGitBranchName();
        if(branchName) {
            attributes[GitResourceAttributes.VCS_BRANCH_NAME] = branchName;
        }

        return new Resource(attributes);
    }

    readPostInstallResource(): Resource {
        try {
            // from dist/src/ to package root (where the file is stored)
            const attributes = require(`../../${postInstallFileName}`);
            return new Resource(attributes);
        } catch {
            return Resource.empty();
        }
    }

}

export const gitSyncDetector = new GitSyncDetector();
export const gitDetector = syncDetectorToDetector(gitSyncDetector);

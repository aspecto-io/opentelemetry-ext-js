
export const postInstallFileName = 'post-install-git-resource.json';

export const gitSha1Regex = /^[0-9a-f]{40}$/;

export const GitResourceAttributes = {

    /**
     * An identifier for the version control system (VCS) being used.
     */
    VCS_SYSTEM: 'vcs.system',

    /**
     * A unique ID identifying the current commit.
     */
    VCS_COMMIT_ID: 'vcs.commit.id',

    /**
     * A unique ID identifying the current clone of the repository.
     * Different clones on same machine will have different clone ids.
     */
    VCS_CLONE_ID: 'vcs.clone.id',

    /**
     * The name of the current, active branch
     */
    VCS_BRANCH_NAME: 'vcs.branch.name',

}

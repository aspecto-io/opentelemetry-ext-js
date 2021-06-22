import path from 'path';
import { executeGitCommand, readFileFromGitDir } from './fecth-git-data';

const extractBranchNameFromRef = (ref: string): string | undefined => {
    if (!ref.startsWith('refs/heads/')) {
        return;
    }
    return ref.split(path.sep)[2];
};

const branchNameFromEnv = (): string => {
    const possibleEnvVars = [
        'GIT_BRANCH_NAME',
        'VCS_BRANCH_NAME', // attribute name syntax
        'GITHUB_HEAD_REF', // CI: GitHub Actions. the name is misleading, this is actually branch name and not the ref
    ];

    for (const envVar of possibleEnvVars) {
        if (process.env[envVar]) {
            return process.env[envVar];
        }
    }

    // following env variables are supplying the ref and not branch name
    const asRef = [
        'GITHUB_REF', // CI: Github Actions
    ];

    for (const envVar of asRef) {
        if (process.env[envVar]) {
            const ref = process.env[envVar];
            const branchName = extractBranchNameFromRef(ref);
            if (branchName) {
                return branchName;
            }
        }
    }
};

const getBranchNameFromGitCli = (): string => {
    const gitGetShaCommand = 'git branch --show-current';
    try {
        return executeGitCommand(gitGetShaCommand);
    } catch {}
};

/**
 * Try to read git branch name directly from git dir.
 * This can be useful if git cli is not installed (like if codebase was copied / mounted into a docker container).
 * This method assumes that git directory is called '.git' and that cwd of the process is the repo root.
 */
const branchNameFromGitDir = (): string => {
    try {
        const rev = readFileFromGitDir('HEAD');
        if (rev.startsWith('ref: ')) {
            // can return something like 'ref: refs/heads/resource-detectors'
            const ref = rev.substring(5).replace('\n', '');
            return extractBranchNameFromRef(ref);
        }
    } catch {
        // file is missing or content not as expected
    }
};

export const getGitBranchName = (): string | undefined => {
    const valueFromEnv = branchNameFromEnv();
    if (valueFromEnv) {
        return valueFromEnv;
    }

    const valueFromCli = getBranchNameFromGitCli();
    if (valueFromCli) {
        return valueFromCli;
    }

    const valueFromGitDir = branchNameFromGitDir();
    if (valueFromGitDir) {
        return valueFromGitDir;
    }
};

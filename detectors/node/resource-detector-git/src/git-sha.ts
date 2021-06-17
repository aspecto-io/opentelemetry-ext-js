import child_process from 'child_process';
import fs from 'fs';
import path from 'path';
import { gitSha1Regex } from './types';

/**
 * Try to run git cli to find the git sha of the current HEAD
 *
 * @returns {(string | null)} - returns the extended SHA-1 of the HEAD, or null if not successful
 */
const headShaFromGitCli = (): string | null => {
    const gitGetShaCommand = 'git rev-parse HEAD';
    try {
        return child_process
            .execSync(gitGetShaCommand, { stdio: ['ignore', 'pipe', 'pipe'] })
            .toString()
            .trim();
    } catch {
        // throws if git not installed, or if this is not a git repo, or if command fails
        return null;
    }
};

/**
 * Try to read git sha of HEAD directly from git dir.
 * This can be useful if git cli is not installed (like if codebase was copied / mounted into a docker container).
 * This method assumes that git directory is called '.git' and that cwd of the process is the repo root.
 *
 * @returns {(string | null)}
 * @memberof GitSyncDetector
 */
const headShaFromGitDir = (): string | null => {
    try {
        const headFilePath = path.join(process.cwd(), '.git', 'HEAD');
        const rev = fs.readFileSync(headFilePath).toString().trim();
        if (rev.match(gitSha1Regex)) {
            return rev;
        } else if (rev.startsWith('ref: ')) {
            // can return something like 'ref: refs/heads/resource-detectors'
            const ref = rev.substring(5).replace('\n', '');
            const refFile = path.join(process.cwd(), '.git', ref);
            return fs.readFileSync(refFile).toString().replace('\n', '').trim();
        }
    } catch {
        // file is missing or content not as expected
    }
    return null;
};

const shaFromEnvVariable = (): string => {
    const possibleEnvVars = [
        'GIT_COMMIT_SHA', // Value used to sha which will also be persisted to postinstall file
        'VCS_COMMIT_ID', // attribute name syntax
        'GITHUB_SHA', // CI: GitHub Actions
        'CIRCLE_SHA1', // CI: CircleCI
        'TRAVIS_PULL_REQUEST_SHA', // CI: TravisCI
        'CI_COMMIT_SHA', // CI: GitLab CI/CD
    ];

    for (const envVar of possibleEnvVars) {
        if (process.env[envVar]) {
            return process.env[envVar];
        }
    }
};

export const getHeadSha = (): string | null => {
    // if running in CI context, try to get git sha from environment variables first
    const envSha = shaFromEnvVariable();
    if (envSha) {
        return envSha;
    }

    // try to use git cli, which may not work if cli not installed on the machine
    const cliValue = headShaFromGitCli();
    if (cliValue) {
        return cliValue;
    }

    // if git cli did not work, but we do have the .git directory, try to read from it directly
    const dirValue = headShaFromGitDir();
    if (dirValue) {
        return dirValue;
    }

    // try to get githash capture by postinstall script
    try {
        const postInstallJson = require('../../../aspecto-post-install-githash.json');
        if (postInstallJson.githash) return postInstallJson.githash;
    } catch {}

    return null;
};

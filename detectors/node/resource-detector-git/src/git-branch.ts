import child_process from 'child_process';
import fs from 'fs';
import path from 'path';
import { gitSha1Regex } from './types';

const getBranchNameFromGitCli = (): string => {
    const gitGetShaCommand = 'git branch --show-current';
    try {
        return child_process
            .execSync(gitGetShaCommand, { stdio: ['ignore', 'pipe', 'pipe'] })
            .toString()
            .trim();
    } catch {}
};

/**
 * Try to read git branch name directly from git dir.
 * This can be useful if git cli is not installed (like if codebase was copied / mounted into a docker container).
 * This method assumes that git directory is called '.git' and that cwd of the process is the repo root.
 */
 const branchNameFromGitDir = (): string => {
    try {
        const headFilePath = path.join(process.cwd(), '.git', 'HEAD');
        const rev = fs.readFileSync(headFilePath).toString().trim();
        if (rev.match(gitSha1Regex)) {
            // detached HEAD
            return null;
        } else if (rev.startsWith('ref: ')) {
            // can return something like 'ref: refs/heads/resource-detectors'
            const ref = rev.substring(5).replace('\n', '');
            return ref.split(path.sep)[2];
        }
    } catch {
        // file is missing or content not as expected
    }
};

export const getGitBranchName = (): string | undefined => {
    const valueFromCli = getBranchNameFromGitCli();
    if(valueFromCli) {
        return valueFromCli;
    }

    const valueFromGitDir = branchNameFromGitDir();
    if(valueFromGitDir) {
        return valueFromGitDir;
    }
};

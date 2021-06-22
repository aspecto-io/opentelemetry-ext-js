import child_process from 'child_process';
import path from 'path';
import fs from 'fs';

export const executeGitCommand = (gitCommand: string): string => {
    return child_process
        .execSync(gitCommand, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 250 })
        .toString()
        .trim();
};

export const readFileFromGitDir = (pathInGit: string): string => {
    const headFilePath = path.join(process.cwd(), '.git', pathInGit);
    return fs.readFileSync(headFilePath).toString().trim();
};

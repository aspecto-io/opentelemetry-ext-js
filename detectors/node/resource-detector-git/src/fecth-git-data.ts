import child_process from 'child_process';
import path from 'path';
import fs from 'fs';

export const executeGitCommand = (gitCommand: string): string => {
    try {
        return child_process
        .execSync(gitCommand, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 250 })
        .toString()
        .trim();
    } catch {}
};

export const readFileFromGitDir = (pathInGit: string): string => {
    // git always use refs with '/', but on windows, when accessing the fs,
    // we should replace it to '\'
    const pathInGitOsSpecific = pathInGit.replace('/', path.sep);
    const headFilePath = path.join(process.cwd(), '.git', pathInGitOsSpecific);
    return fs.readFileSync(headFilePath).toString().trim();
};

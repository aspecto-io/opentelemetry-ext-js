import child_process from 'child_process';

const getBranchNameFromGitCli = (): string => {
    const gitGetShaCommand = 'git branch --show-current';
    try {
        return child_process
            .execSync(gitGetShaCommand, { stdio: ['ignore', 'pipe', 'pipe'] })
            .toString()
            .trim();
    } catch {}
};

export const getGitBranchName = (): string | undefined => {
    const valueFromCli = getBranchNameFromGitCli();
    return valueFromCli;
};

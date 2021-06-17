import child_process from 'child_process';
import { v4 as uuidv4 } from 'uuid';

const gitConfigName = 'opentelemetry.resource.clone.id';

const readGitConfig = (): string | undefined => {
    const gitConfigReadCommand = `git config --local ${gitConfigName}`;
    try {
        return child_process
            .execSync(gitConfigReadCommand, { stdio: ['ignore', 'pipe', 'pipe'] })
            .toString()
            .trim();
    } catch {}
};

const writeGitConfig = (value: string) => {
    const gitConfigWriteCommand = `git config --local ${gitConfigName} ${value}`;
    try {
        return child_process.execSync(gitConfigWriteCommand, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch {}
};

export const getCloneId = (): string | undefined => {
    const aspectoGitCloneId = readGitConfig();
    if (aspectoGitCloneId) return aspectoGitCloneId;

    const newId = uuidv4();
    writeGitConfig(newId);
    return readGitConfig();
}

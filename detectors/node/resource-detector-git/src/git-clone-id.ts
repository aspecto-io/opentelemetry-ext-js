import { v4 as uuidv4 } from 'uuid';
import { executeGitCommand } from './fecth-git-data';

const gitConfigName = 'opentelemetry.resource.clone.id';

const readGitConfig = (): string | undefined => {
    return executeGitCommand(`git config --local ${gitConfigName}`);
};

const writeGitConfig = (value: string) => {
    return executeGitCommand(`git config --local ${gitConfigName} ${value}`);
};

export const getCloneId = (): string | undefined => {
    const aspectoGitCloneId = readGitConfig();
    if (aspectoGitCloneId) return aspectoGitCloneId;

    const newId = uuidv4();
    writeGitConfig(newId);
    return readGitConfig();
};

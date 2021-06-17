import 'mocha';
import expect from 'expect';
import { gitSyncDetector } from '../src';
import { GitResourceAttributes } from '../src/types';
import child_process from 'child_process';

//  used to run the detector in such a way that git cli is not available
const runWithNoEnvPath = (fn: Function) => {
    const origPATH = process.env.PATH;
    process.env.PATH = '';
    try {
        fn();
    } finally {
        process.env.PATH = origPATH;
    }
};

// used to set cwd so it's match the .git directory
const runWithSpecificCwd = (newCwd: string, fn: Function) => {
    const origCwd = process.cwd();
    process.chdir(newCwd);
    try {
        fn();
    } finally {
        process.chdir(origCwd);
    }
};

describe('service detector', () => {
    describe('HEAD sha', () => {
        it('from CI env vars', () => {
            process.env.GIT_COMMIT_SHA = '0123456789012345678901234567890123456789';
            const resource1 = gitSyncDetector.createGitResourceFromGitDb();
            expect(resource1.attributes[GitResourceAttributes.VCS_COMMIT_ID]).toMatch(process.env.GIT_COMMIT_SHA);
            delete process.env.GIT_COMMIT_SHA;

            process.env.VCS_COMMIT_ID = '0123401234012340123401234012340123401234';
            const resource2 = gitSyncDetector.createGitResourceFromGitDb();
            expect(resource2.attributes[GitResourceAttributes.VCS_COMMIT_ID]).toMatch(process.env.VCS_COMMIT_ID);
            delete process.env.VCS_COMMIT_ID;

            process.env.GITHUB_SHA = 'abcdeabcdeabcdeabcdeabcdeabcdeabcdeabcde';
            const resource3 = gitSyncDetector.createGitResourceFromGitDb();
            expect(resource3.attributes[GitResourceAttributes.VCS_COMMIT_ID]).toMatch(process.env.GITHUB_SHA);
            delete process.env.GITHUB_SHA;

            process.env.CIRCLE_SHA1 = '0000000000111111111122222222223333333333';
            const resource4 = gitSyncDetector.createGitResourceFromGitDb();
            expect(resource4.attributes[GitResourceAttributes.VCS_COMMIT_ID]).toMatch(process.env.CIRCLE_SHA1);
            delete process.env.CIRCLE_SHA1;

            process.env.TRAVIS_PULL_REQUEST_SHA = '0101010101989898989845454545453434343434';
            const resource5 = gitSyncDetector.createGitResourceFromGitDb();
            expect(resource5.attributes[GitResourceAttributes.VCS_COMMIT_ID]).toMatch(
                process.env.TRAVIS_PULL_REQUEST_SHA
            );
            delete process.env.TRAVIS_PULL_REQUEST_SHA;

            process.env.CI_COMMIT_SHA = 'abababababcdcdcdcdcdefefefefef0101010101';
            const resource6 = gitSyncDetector.createGitResourceFromGitDb();
            expect(resource6.attributes[GitResourceAttributes.VCS_COMMIT_ID]).toMatch(process.env.CI_COMMIT_SHA);
            delete process.env.CI_COMMIT_SHA;
        });

        it('read from git cli', () => {
            const expectedHeadSha = child_process.execSync('git rev-parse HEAD').toString().trim();
            const resource = gitSyncDetector.createGitResourceFromGitDb();
            expect(resource.attributes[GitResourceAttributes.VCS_COMMIT_ID]).toMatch(expectedHeadSha);
            expect(expectedHeadSha).toMatch(/^[0-9a-f]{40}$/);
        });

        it('read from git dir', () => {
            const expectedHeadSha = child_process.execSync('git rev-parse HEAD').toString().trim();

            runWithNoEnvPath(() => {
                // change cwd so it's in the same dir as .git'
                runWithSpecificCwd('../../../', () => {
                    const resource = gitSyncDetector.createGitResourceFromGitDb();
                    expect(resource.attributes[GitResourceAttributes.VCS_COMMIT_ID]).toMatch(expectedHeadSha);
                });
            });
        });
    });

    // these test are using the current git repo setting.
    // in case of detached HEAD, they might not work.
    // maybe they can be improved...
    describe('git branch', () => {
        it('read with git cli', () => {
            const expectedBranchName = child_process.execSync('git branch --show-current').toString().trim();
            const resource = gitSyncDetector.createGitResourceFromGitDb();
            expect(resource.attributes[GitResourceAttributes.VCS_BRANCH_NAME]).toMatch(expectedBranchName);
        });

        it('read with git dir', () => {
            const expectedBranchName = child_process.execSync('git branch --show-current').toString().trim();
            runWithNoEnvPath(() => {
                runWithSpecificCwd('../../../', () => {
                    const resource = gitSyncDetector.createGitResourceFromGitDb();
                    expect(resource.attributes[GitResourceAttributes.VCS_BRANCH_NAME]).toMatch(expectedBranchName);
                });
            });
        });
    });

    it('read git data', () => {
        const resource = gitSyncDetector.createGitResourceFromGitDb();
        expect(resource.attributes[GitResourceAttributes.VCS_SYSTEM]).toMatch('git');
        expect(resource.attributes[GitResourceAttributes.VCS_COMMIT_ID]).toMatch(/^[0-9a-f]{40}$/);
        expect(resource.attributes[GitResourceAttributes.VCS_CLONE_ID]).toMatch(
            /^[0-9a-f]{8}\b-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-\b[0-9a-f]{12}$/
        );
        expect(resource.attributes[GitResourceAttributes.VCS_BRANCH_NAME]).toBeDefined();
    });
});

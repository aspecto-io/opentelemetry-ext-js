import 'mocha';
import expect from 'expect';
import { gitSyncDetector } from '../src';
import { GitResourceAttributes } from '../src/types';
import * as utils from '../src/fecth-git-data';
import * as sinon from 'sinon';
import { Resource } from '@opentelemetry/resources';

describe('git detector', () => {

    afterEach(() => {
        sinon.restore();
    });

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
            const expectedHeadSha = '0000000000111111111122222222223333333333';
            sinon.stub(utils, 'executeGitCommand').callsFake(() => expectedHeadSha);
            const resource = gitSyncDetector.createGitResourceFromGitDb();
            expect(resource.attributes[GitResourceAttributes.VCS_COMMIT_ID]).toMatch(expectedHeadSha);
        });

        it('read from git dir when HEAD is SHA', () => {
            const expectedHeadSha = '3333333333222222222211111111110000000000';

            // running the command returns empty result -> thus fails and fallback to git dir
            sinon.stub(utils, 'executeGitCommand').callsFake(() => '');

            // reading HEAD returns a SHA value (like what you'll get in detached HEAD setup)
            sinon
                .stub(utils, 'readFileFromGitDir')
                .withArgs('HEAD')
                .callsFake(() => expectedHeadSha);

            const resource = gitSyncDetector.createGitResourceFromGitDb();
            expect(resource.attributes[GitResourceAttributes.VCS_COMMIT_ID]).toMatch(expectedHeadSha);
        });

        it('read from git dir when HEAD is ref to branch', () => {
            const expectedHeadSha = '3333333333111111111100000000002222222222';
            const headRef = 'refs/heads/my-testing-branch';

            // running the command returns empty result -> thus fails and fallback to git dir
            sinon.stub(utils, 'executeGitCommand').callsFake(() => '');

            // reading HEAD returns a SHA value (like what you'll get in detached HEAD setup)
            const fsStub = sinon.stub(utils, 'readFileFromGitDir');
            fsStub.withArgs('HEAD').callsFake(() => `ref: ${headRef}`);
            fsStub.withArgs(headRef).callsFake(() => expectedHeadSha);

            const resource = gitSyncDetector.createGitResourceFromGitDb();
            expect(resource.attributes[GitResourceAttributes.VCS_COMMIT_ID]).toMatch(expectedHeadSha);
        });

        it('read from git dir when HEAD is ref to tag', () => {
            const tagHeadSha = '3333333333111111111100000000002222222222';
            const headRef = 'refs/tags/my-testing-branch';

            // running the command returns empty result -> thus fails and fallback to git dir
            sinon.stub(utils, 'executeGitCommand').callsFake(() => '');

            // reading HEAD returns a SHA value (like what you'll get in detached HEAD setup)
            const fsStub = sinon.stub(utils, 'readFileFromGitDir');
            fsStub.withArgs('HEAD').callsFake(() => `ref: ${headRef}`);
            fsStub.withArgs(headRef).callsFake(() => tagHeadSha);

            const resource = gitSyncDetector.createGitResourceFromGitDb();
            expect(resource).toStrictEqual(Resource.empty());
        });

        it('read from git dir when HEAD is ref and is not SHA', () => {
            const nonShaContent = 'this is not a SHA value';
            const headRef = 'refs/heads/my-testing-branch';

            // running the command returns empty result -> thus fails and fallback to git dir
            sinon.stub(utils, 'executeGitCommand').callsFake(() => '');

            // reading HEAD returns a SHA value (like what you'll get in detached HEAD setup)
            const fsStub = sinon.stub(utils, 'readFileFromGitDir');
            fsStub.withArgs('HEAD').callsFake(() => `ref: ${headRef}`);
            fsStub.withArgs(headRef).callsFake(() => nonShaContent);

            // when we could not resolve a SHA, we return empty resource
            const resource = gitSyncDetector.createGitResourceFromGitDb();
            expect(resource).toStrictEqual(Resource.empty());
        });
    });

    // these test are using the current git repo setting.
    // in case of detached HEAD, they might not work.
    // maybe they can be improved...
    describe('git branch', () => {
        it('read with git cli', () => {
            const expectedBranchName = 'my-testing-branch';
            sinon.stub(utils, 'executeGitCommand').callsFake(() => expectedBranchName);
            const resource = gitSyncDetector.createGitResourceFromGitDb();
            expect(resource.attributes[GitResourceAttributes.VCS_BRANCH_NAME]).toMatch(expectedBranchName);
        });

        it('read with git dir detached HEAD', () => {
            const headSha = '3333333333111111111100000000002222222222';

            const executeGitSha = sinon.stub(utils, 'executeGitCommand');
            executeGitSha.withArgs('git rev-parse HEAD').callsFake(() => headSha);
            executeGitSha.withArgs('git branch --show-current').callsFake(() => '');
            const fsStub = sinon.stub(utils, 'readFileFromGitDir');
            fsStub.withArgs('HEAD').callsFake(() => headSha);

            const resource = gitSyncDetector.createGitResourceFromGitDb();
            expect(resource.attributes[GitResourceAttributes.VCS_BRANCH_NAME]).toBeUndefined();
        });

        it('read with git dir with heads ref', () => {
            const branchName = 'my-testing-branch';
            const headSha = '3333333333111111111100000000002222222222';

            const executeGitSha = sinon.stub(utils, 'executeGitCommand');
            executeGitSha.withArgs('git rev-parse HEAD').callsFake(() => headSha);
            executeGitSha.withArgs('git branch --show-current').callsFake(() => '');
            const fsStub = sinon.stub(utils, 'readFileFromGitDir');
            fsStub.withArgs('HEAD').callsFake(() => `ref: refs/heads/${branchName}`);

            const resource = gitSyncDetector.createGitResourceFromGitDb();
            expect(resource.attributes[GitResourceAttributes.VCS_BRANCH_NAME]).toMatch(branchName);
        });
    });

    describe('git clone id', () => {

        it('should read existing value', () => {
            const headSha = '3333333333111111111100000000002222222222';
            const expectedGitCloneId = 'git-clone-id-from-tests';

            const executeGitSha = sinon.stub(utils, 'executeGitCommand');
            executeGitSha.withArgs('git rev-parse HEAD').callsFake(() => headSha);
            executeGitSha.withArgs('git config --local opentelemetry.resource.clone.id').returns(expectedGitCloneId);

            const resource = gitSyncDetector.createGitResourceFromGitDb();
            expect(resource.attributes[GitResourceAttributes.VCS_CLONE_ID]).toMatch(expectedGitCloneId);
        });

        it('should write git clone id when reading fails', () => {
            const headSha = '3333333333111111111100000000002222222222';
            const expectedGitCloneId = 'git-clone-id-from-tests';

            const executeGitSha = sinon.stub(utils, 'executeGitCommand');
            executeGitSha.withArgs('git rev-parse HEAD').callsFake(() => headSha);
            executeGitSha
                .withArgs('git config --local opentelemetry.resource.clone.id')
                .onFirstCall()
                .returns('')
                .onSecondCall()
                .returns(expectedGitCloneId);
            executeGitSha
                .withArgs(sinon.match((cmd) => cmd.startsWith('git config --local opentelemetry.resource.clone.id ')))
                .onFirstCall()
                .returns('0');

            const resource = gitSyncDetector.createGitResourceFromGitDb();
            expect(resource.attributes[GitResourceAttributes.VCS_CLONE_ID]).toMatch(expectedGitCloneId);

            // assert that writing git config is with valid uuid
            const gitWriteCommand = executeGitSha.getCall(2).args[0];
            expect(gitWriteCommand.split(' ')[4]).toMatch(
                /^[0-9a-f]{8}\b-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-\b[0-9a-f]{12}$/
            );
        });
    });
});

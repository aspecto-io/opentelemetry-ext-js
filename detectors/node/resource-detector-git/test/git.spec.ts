import 'mocha';
import expect from 'expect';
import { gitDetector, gitSyncDetector } from '../src';
import { ResourceAttributes } from '@opentelemetry/semantic-conventions';
import { GitResourceAttributes } from '../src/types';
import child_process from 'child_process';

describe('service detector', () => {

    describe('HEAD sha', () => {
        
        it('from CI env vars', () => {

            process.env.GITHUB_SHA = '0123456789012345678901234567890123456789';
            const resource1 = gitSyncDetector.detect();
            expect(resource1.attributes[GitResourceAttributes.VCS_COMMIT_ID]).toMatch(process.env.GITHUB_SHA);
            delete process.env.GITHUB_SHA;

            process.env.CIRCLE_SHA1 = '0000000000111111111122222222223333333333';
            const resource2 = gitSyncDetector.detect();
            expect(resource2.attributes[GitResourceAttributes.VCS_COMMIT_ID]).toMatch(process.env.CIRCLE_SHA1);
            delete process.env.CIRCLE_SHA1;

            process.env.TRAVIS_PULL_REQUEST_SHA = '0101010101989898989845454545453434343434';
            const resource3 = gitSyncDetector.detect();
            expect(resource3.attributes[GitResourceAttributes.VCS_COMMIT_ID]).toMatch(process.env.TRAVIS_PULL_REQUEST_SHA);
            delete process.env.TRAVIS_PULL_REQUEST_SHA;

            process.env.CI_COMMIT_SHA = 'abababababcdcdcdcdcdefefefefef0101010101';
            const resource4 = gitSyncDetector.detect();
            expect(resource4.attributes[GitResourceAttributes.VCS_COMMIT_ID]).toMatch(process.env.CI_COMMIT_SHA);
            delete process.env.CI_COMMIT_SHA;
        });

        it('read from git cli', () => {
            const expectedHeadSha = child_process.execSync('git rev-parse HEAD').toString().trim();
            const resource = gitSyncDetector.detect();
            expect(resource.attributes[GitResourceAttributes.VCS_COMMIT_ID]).toMatch(expectedHeadSha);
            expect(expectedHeadSha).toMatch(/^[0-9a-f]{40}$/);
        });

        it('read from file', () => {
            const expectedHeadSha = child_process.execSync('git rev-parse HEAD').toString().trim();

            const origPATH = process.env.PATH;
            process.env.PATH = '';
            const origCwd = process.cwd();
            // change cwd so it's in the same dir as .git'
            process.chdir('../../../');

            const resource = gitSyncDetector.detect();
            expect(resource.attributes[GitResourceAttributes.VCS_COMMIT_ID]).toMatch(expectedHeadSha);
            
            // restore PATH
            process.env.PATH = origPATH;
            process.chdir(origCwd);
        });
    })

    it('read git data', () => {
        const resource = gitSyncDetector.detect();
        expect(resource.attributes[GitResourceAttributes.VCS_SYSTEM]).toMatch('git');
        expect(resource.attributes[GitResourceAttributes.VCS_COMMIT_ID]).toMatch(/^[0-9a-f]{40}$/);
        expect(resource.attributes[GitResourceAttributes.VCS_CLONE_ID]).toMatch(/^[0-9a-f]{8}\b-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-\b[0-9a-f]{12}$/);
        expect(resource.attributes[GitResourceAttributes.VCS_BRANCH_NAME]).toBeDefined();
    });

});

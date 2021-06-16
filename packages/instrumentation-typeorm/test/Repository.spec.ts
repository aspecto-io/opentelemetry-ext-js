import 'mocha';
import expect from 'expect';
import { TypeormInstrumentation } from '../src';
import { getTestSpans } from 'opentelemetry-instrumentation-testing-utils';

const instrumentation = new TypeormInstrumentation();
import { localPostgreSQLOptions, User } from './utils';
import * as typeorm from 'typeorm';

describe('Repository', () => {
    beforeEach(() => {
        instrumentation.enable();
    });

    afterEach(() => {
        instrumentation.disable();
    });

    it('findAndCount', async () => {
        const conn = await typeorm.createConnection(localPostgreSQLOptions);
        try {
            const repo = conn.getRepository(User);
            const [users, count] = await repo.findAndCount();
            expect(count).toBeGreaterThan(0);

            const spans = getTestSpans();
            expect(spans.length).toEqual(1);
        } finally {
            await conn.close();
        }
    });
});

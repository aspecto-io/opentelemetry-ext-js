import 'mocha';
import expect from 'expect';
import { TypeormInstrumentation } from '../src';
import { getTestSpans } from 'opentelemetry-instrumentation-testing-utils';

const instrumentation = new TypeormInstrumentation();
import { defaultOptions, User } from './utils';
import * as typeorm from 'typeorm';

describe('Repository', () => {
    beforeEach(() => {
        instrumentation.enable();
    });

    afterEach(() => {
        instrumentation.disable();
    });

    it('findAndCount', async () => {
        const connection = await typeorm.createConnection(defaultOptions);
        const repo = connection.getRepository(User);
        const user = new User(1, 'aspecto', 'io');
        await repo.insert(user);
        const [users, count] = await repo.findAndCount();
        expect(count).toBeGreaterThan(0);

        const spans = getTestSpans();
        expect(spans.length).toEqual(1);
        await connection.close();
    });
});

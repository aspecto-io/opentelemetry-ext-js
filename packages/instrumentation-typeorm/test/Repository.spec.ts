import 'mocha';
import expect from 'expect';
import { TypeormInstrumentation, TypeormInstrumentationConfig } from '../src';
import { getTestSpans, registerInstrumentationTesting } from '@opentelemetry/contrib-test-utils';

const instrumentation = registerInstrumentationTesting(new TypeormInstrumentation());
import { defaultOptions, User } from './utils';
import * as typeorm from 'typeorm';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { context, ROOT_CONTEXT } from '@opentelemetry/api';

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
        expect(spans.length).toEqual(2);
        const span = spans[0];
        const attributes = span.attributes;
        expect(attributes[SemanticAttributes.DB_SQL_TABLE]).toBe('user');
        await connection.close();
    });
});

describe('requireParentSpan', () => {
    beforeEach(() => {
        instrumentation.disable();
        instrumentation.setConfig({
            requireParentSpan: true,
        } as TypeormInstrumentationConfig);
        instrumentation.enable();
    });

    it('should not have spans', async () => {
        const connection = await typeorm.createConnection({
            name: 'repoRequireParentSpanCon',
            type: 'sqlite',
            database: 'repoRequireParentSpan.db',
            entities: [User],
            synchronize: true,
        });

        context.with(ROOT_CONTEXT, async () => {
            const repo = connection.getRepository(User);
            const user = new User(1, 'aspecto', 'io');
            await repo.insert(user);
            await connection.close();
            const spans = getTestSpans();
            expect(spans.length).toBe(0);
        });
    });
});

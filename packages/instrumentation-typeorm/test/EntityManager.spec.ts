import 'mocha';
import expect from 'expect';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { TypeormInstrumentation, TypeormInstrumentationConfig } from '../src';
import { getTestSpans } from '@opentelemetry/contrib-test-utils';
import { context, ROOT_CONTEXT } from '@opentelemetry/api';

const instrumentation = new TypeormInstrumentation();
import * as typeorm from 'typeorm';
import { defaultOptions, User } from './utils';

describe('EntityManager', () => {
    after(() => {
        instrumentation.enable();
    });
    beforeEach(() => {
        instrumentation.enable();
    });
    afterEach(() => {
        instrumentation.disable();
    });

    describe('single connection', () => {
        it('save using connection.manager', async () => {
            const options = defaultOptions;
            const connection = await typeorm.createConnection(defaultOptions);
            const user = new User(1, 'aspecto', 'io');
            await connection.manager.save(user);
            const typeOrmSpans = getTestSpans();

            expect(typeOrmSpans.length).toBe(1);
            expect(typeOrmSpans[0].status.code).toBe(SpanStatusCode.UNSET);
            const attributes = typeOrmSpans[0].attributes;
            expect(attributes[SemanticAttributes.DB_SQL_TABLE]).toBe('user');
            expect(attributes[SemanticAttributes.DB_SYSTEM]).toBe(options.type);
            expect(attributes[SemanticAttributes.DB_NAME]).toBe(options.database);
            expect(attributes[SemanticAttributes.DB_OPERATION]).toBe('save');
            expect(attributes[SemanticAttributes.DB_STATEMENT]).toBe(JSON.stringify({ targetOrEntity: user }));
            await connection.close();
        });

        it('save', async () => {
            const options = defaultOptions;
            const connection = await typeorm.createConnection(defaultOptions);
            const manager = connection.createEntityManager();
            const user = new User(1, 'aspecto', 'io');
            await manager.save(user);
            const typeOrmSpans = getTestSpans();

            expect(typeOrmSpans.length).toBe(1);
            expect(typeOrmSpans[0].status.code).toBe(SpanStatusCode.UNSET);
            const attributes = typeOrmSpans[0].attributes;
            expect(attributes[SemanticAttributes.DB_SQL_TABLE]).toBe('user');
            expect(attributes[SemanticAttributes.DB_SYSTEM]).toBe(options.type);
            expect(attributes[SemanticAttributes.DB_NAME]).toBe(options.database);
            expect(attributes[SemanticAttributes.DB_OPERATION]).toBe('save');
            expect(attributes[SemanticAttributes.DB_STATEMENT]).toBe(JSON.stringify({ targetOrEntity: user }));
            await connection.close();
        });

        it('remove', async () => {
            const options = defaultOptions;
            const connection = await typeorm.createConnection(defaultOptions);
            const manager = connection.createEntityManager();

            const user = new User(56, 'aspecto', 'io');
            await manager.save(user);
            await manager.remove(user);
            const typeOrmSpans = getTestSpans();

            expect(typeOrmSpans.length).toBe(2);
            expect(typeOrmSpans[1].status.code).toBe(SpanStatusCode.UNSET);
            const attributes = typeOrmSpans[1].attributes;
            expect(attributes[SemanticAttributes.DB_SQL_TABLE]).toBe('user');
            expect(attributes[SemanticAttributes.DB_SYSTEM]).toBe(options.type);
            expect(attributes[SemanticAttributes.DB_NAME]).toBe(options.database);
            expect(attributes[SemanticAttributes.DB_OPERATION]).toBe('remove');
            expect(attributes[SemanticAttributes.DB_STATEMENT]).toBe(
                JSON.stringify({ targetOrEntity: { id: 56, firstName: 'aspecto', lastName: 'io' } })
            );
            await connection.close();
        });

        it('update', async () => {
            const options = defaultOptions;
            const connection = await typeorm.createConnection(defaultOptions);
            const manager = connection.createEntityManager();
            const user = new User(56, 'aspecto', 'io');
            await manager.save(user);
            const partialEntity = { lastName: '.io' };
            await manager.update(User, 56, partialEntity);
            const typeOrmSpans = getTestSpans();

            expect(typeOrmSpans.length).toBe(2);
            expect(typeOrmSpans[1].status.code).toBe(SpanStatusCode.UNSET);
            const attributes = typeOrmSpans[1].attributes;
            expect(attributes[SemanticAttributes.DB_SQL_TABLE]).toBe('user');
            expect(attributes[SemanticAttributes.DB_SYSTEM]).toBe(options.type);
            expect(attributes[SemanticAttributes.DB_NAME]).toBe(options.database);
            expect(attributes[SemanticAttributes.DB_OPERATION]).toBe('update');
            expect(attributes[SemanticAttributes.DB_STATEMENT]).toBe(
                JSON.stringify({ target: 'User', criteria: 56, partialEntity })
            );
            await connection.close();
        });

        it('Sets failure status when function throws', async () => {
            const connection = await typeorm.createConnection(defaultOptions);
            const manager = connection.createEntityManager();
            try {
                await manager.find({} as any);
            } catch (err) {}

            const typeOrmSpans = getTestSpans();
            expect(typeOrmSpans.length).toBe(1);
            expect(typeOrmSpans[0].status.code).toBe(SpanStatusCode.ERROR);
            expect(typeOrmSpans[0].status.message).toBe('No metadata for "[object Object]" was found.');
            await connection.close();
        });
    });

    describe('multiple connections', () => {
        const options2: any = {
            name: 'connection2',
            type: 'sqlite',
            database: 'connection2.db',
            entities: [User],
            synchronize: true,
        };

        it('appends matching connection details to span', async () => {
            const [sqlite1, sqlite2] = await typeorm.createConnections([defaultOptions, options2]);
            const manager1 = sqlite1.createEntityManager();
            const manager2 = sqlite2.createEntityManager();

            const user = new User(1, 'aspecto', 'io');
            await manager1.save(user);
            await manager2.remove(user);

            const spans = getTestSpans();
            expect(spans.length).toBe(2);
            const sqlite1Span = spans[0];
            const sqlite2Span = spans[1];

            expect(sqlite1Span.attributes[SemanticAttributes.DB_SYSTEM]).toBe(defaultOptions.type);
            expect(sqlite1Span.attributes[SemanticAttributes.DB_NAME]).toBe(defaultOptions.database);
            expect(sqlite1Span.attributes[SemanticAttributes.DB_OPERATION]).toBe('save');
            expect(sqlite1Span.attributes[SemanticAttributes.DB_SQL_TABLE]).toBe('user');

            expect(sqlite2Span.attributes[SemanticAttributes.DB_SYSTEM]).toBe(options2.type);
            expect(sqlite2Span.attributes[SemanticAttributes.DB_NAME]).toBe(options2.database);
            expect(sqlite2Span.attributes[SemanticAttributes.DB_OPERATION]).toBe('remove');
            expect(sqlite2Span.attributes[SemanticAttributes.DB_SQL_TABLE]).toBe('user');
            await sqlite1.close();
            await sqlite2.close();
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
                name: 'requireParentSpanCon',
                type: 'sqlite',
                database: 'requireParentSpan.db',
                entities: [User],
                synchronize: true,
            });
            const manager = connection.createEntityManager();

            context.with(ROOT_CONTEXT, async () => {
                const user = new User(56, 'aspecto', 'io');
                await manager.save(user);
                await connection.close();
                const spans = getTestSpans();
                expect(spans.length).toBe(0);
            });
        });
    });
});

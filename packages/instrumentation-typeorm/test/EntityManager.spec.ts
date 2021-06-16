import 'mocha';
import expect from 'expect';
import { SpanStatusCode } from '@opentelemetry/api';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { TypeormInstrumentation, TypeormInstrumentationConfig } from '../src';
import { getTestSpans } from 'opentelemetry-instrumentation-testing-utils';

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
        it('save', async () => {
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

        it('remove', async () => {
            const options = defaultOptions;
            const connection = await typeorm.createConnection(defaultOptions);

            const user = new User(56, 'aspecto', 'io');
            await connection.manager.save(user);
            await connection.manager.remove(user);
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
            const user = new User(56, 'aspecto', 'io');
            await connection.manager.save(user);
            const partialEntity = { lastName: '.io' };
            await connection.manager.update(User, 56, partialEntity);
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
            try {
                await connection.manager.find({} as any);
            } catch (err) {}

            const typeOrmSpans = getTestSpans();
            expect(typeOrmSpans.length).toBe(1);
            expect(typeOrmSpans[0].status.code).toBe(SpanStatusCode.ERROR);
            expect(typeOrmSpans[0].status.message).toBe('No metadata for "[object Object]" was found.');
            await connection.close();
        });
    });

    describe('multiple connections', () => {
        const options2: typeorm.ConnectionOptions = {
            name: 'connection2',
            type: 'sqlite',
            database: 'connection2.db',
            entities: [User],
            synchronize: true,
        };

        it('appends matching connection details to span', async () => {
            const [sqlite1, sqlite2] = await typeorm.createConnections([defaultOptions, options2]);

            const user = new User(1, 'aspecto', 'io');
            await sqlite1.manager.save(user);
            await sqlite2.manager.remove(user);

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
});

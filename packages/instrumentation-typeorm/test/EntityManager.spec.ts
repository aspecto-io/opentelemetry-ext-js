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
        it('Creates a basic typeorm span', async () => {
            const options = defaultOptions;
            const connection = await typeorm.createConnection(defaultOptions);
            const user = new User(1, 'aspecto', 'io');
            await connection.manager.save(user);
            const typeOrmSpans = getTestSpans();

            expect(typeOrmSpans.length).toBe(1);
            expect(typeOrmSpans[0].status.code).toBe(SpanStatusCode.UNSET);
            const attributes = typeOrmSpans[0].attributes;
            expect(attributes[SemanticAttributes.DB_SYSTEM]).toBe(options.type);
            expect(attributes[SemanticAttributes.DB_NAME]).toBe(options.database);
            expect(attributes[SemanticAttributes.DB_OPERATION]).toBe('save');
            expect(attributes[SemanticAttributes.DB_STATEMENT]).toBe(JSON.stringify({ targetOrEntity: user }));
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
            database: 'his-db',
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
            const postgresSpan = spans[0];
            const mySqlSpan = spans[1];

            expect(postgresSpan.attributes[SemanticAttributes.DB_SYSTEM]).toBe(defaultOptions.type);
            expect(postgresSpan.attributes[SemanticAttributes.DB_NAME]).toBe(defaultOptions.database);
            expect(postgresSpan.attributes[SemanticAttributes.DB_OPERATION]).toBe('save');

            expect(mySqlSpan.attributes[SemanticAttributes.DB_SYSTEM]).toBe(options2.type);
            expect(mySqlSpan.attributes[SemanticAttributes.DB_NAME]).toBe(options2.database);
            expect(mySqlSpan.attributes[SemanticAttributes.DB_OPERATION]).toBe('remove');
            await sqlite1.close();
            await sqlite2.close();
        });
    });
});

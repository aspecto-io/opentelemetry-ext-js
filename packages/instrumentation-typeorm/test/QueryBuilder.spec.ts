import 'mocha';
import expect from 'expect';
import { SpanStatusCode } from '@opentelemetry/api';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { TypeormInstrumentation } from '../src';
import { getTestSpans } from 'opentelemetry-instrumentation-testing-utils';
const instrumentation = new TypeormInstrumentation();
import * as typeorm from 'typeorm';
import { User, defaultOptions } from './utils';

const getQueryBuilder = (connection: typeorm.Connection) => {
    const testQueryRunner = {
        connection,
        query: (query: string, parameters?: any[]) => Promise.resolve([]),
    } as typeorm.QueryRunner;
    return new typeorm.SelectQueryBuilder<any>(connection, testQueryRunner).from(User, 'users');
};

describe('QueryBuilder', () => {
    beforeEach(() => {
        instrumentation.enable();
    });

    afterEach(() => {
        instrumentation.disable();
    });

    it('getManyAndCount', async () => {
        const connectionOptions = defaultOptions as any;
        const connection = await typeorm.createConnection(connectionOptions);
        const users = await getQueryBuilder(connection)
            .where('user.id = :userId')
            .setParameter('userId', '1')
            .getManyAndCount();
        expect(users.length).toBeGreaterThan(0);
        const typeOrmSpans = getTestSpans();
        expect(typeOrmSpans.length).toBe(1);
        expect(typeOrmSpans[0].status.code).toBe(SpanStatusCode.UNSET);
        const attributes = typeOrmSpans[0].attributes;
        expect(attributes[SemanticAttributes.DB_SYSTEM]).toBe(connectionOptions.type);
        expect(attributes[SemanticAttributes.DB_USER]).toBe(connectionOptions.username);
        expect(attributes[SemanticAttributes.NET_PEER_NAME]).toBe(connectionOptions.host);
        expect(attributes[SemanticAttributes.NET_PEER_PORT]).toBe(connectionOptions.port);
        expect(attributes[SemanticAttributes.DB_NAME]).toBe(connectionOptions.database);
        expect(attributes[SemanticAttributes.DB_SQL_TABLE]).toBe('user');
        expect(attributes[SemanticAttributes.DB_STATEMENT]).toBe('SELECT * FROM "user" "users" WHERE user.id = ?');
        await connection.close();
    });
});

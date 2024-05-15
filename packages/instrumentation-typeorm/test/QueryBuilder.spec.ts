import 'mocha';
import expect from 'expect';
import { SpanStatusCode } from '@opentelemetry/api';
import { SEMATTRS_DB_NAME, SEMATTRS_DB_SQL_TABLE, SEMATTRS_DB_STATEMENT, SEMATTRS_DB_SYSTEM, SEMATTRS_DB_USER, SEMATTRS_NET_PEER_NAME, SEMATTRS_NET_PEER_PORT, SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { TypeormInstrumentation } from '../src';
import { getTestSpans, registerInstrumentationTesting } from '@opentelemetry/contrib-test-utils';
const instrumentation = registerInstrumentationTesting(new TypeormInstrumentation());
import * as typeorm from 'typeorm';
import { defaultOptions, User } from './utils';

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
        const queryBuilder = connection.getRepository(User).createQueryBuilder('user');
        const users = await queryBuilder.where('user.id = :userId', { userId: '1' }).getManyAndCount();
        expect(users.length).toBe(2);
        const typeOrmSpans = getTestSpans();
        expect(typeOrmSpans.length).toBe(1);
        expect(typeOrmSpans[0].status.code).toBe(SpanStatusCode.UNSET);
        const attributes = typeOrmSpans[0].attributes;
        expect(attributes[SEMATTRS_DB_SYSTEM]).toBe(connectionOptions.type);
        expect(attributes[SEMATTRS_DB_USER]).toBe(connectionOptions.username);
        expect(attributes[SEMATTRS_NET_PEER_NAME]).toBe(connectionOptions.host);
        expect(attributes[SEMATTRS_NET_PEER_PORT]).toBe(connectionOptions.port);
        expect(attributes[SEMATTRS_DB_NAME]).toBe(connectionOptions.database);
        expect(attributes[SEMATTRS_DB_SQL_TABLE]).toBe('user');
        expect(attributes[SEMATTRS_DB_STATEMENT]).toBe(
            'SELECT "user"."id" AS "user_id", "user"."firstName" AS "user_firstName", "user"."lastName" AS "user_lastName" FROM "user" "user" WHERE "user"."id" = :userId'
        );
        await connection.close();
    });
});

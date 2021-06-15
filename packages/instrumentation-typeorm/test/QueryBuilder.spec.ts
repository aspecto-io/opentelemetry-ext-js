import 'mocha';
import expect from 'expect';
import { ReadableSpan, Span } from '@opentelemetry/tracing';
import { SpanStatusCode } from '@opentelemetry/api';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { TypeormInstrumentation } from '../src';
import { getTestSpans } from 'opentelemetry-instrumentation-testing-utils';
const instrumentation = new TypeormInstrumentation();

import * as typeorm from 'typeorm';

@typeorm.Entity()
export class User {
    @typeorm.PrimaryGeneratedColumn()
    id: number;

    @typeorm.Column()
    firstName: string;

    @typeorm.Column()
    lastName: string;

    @typeorm.Column({ default: true })
    isActive: boolean;
}

const options: typeorm.ConnectionOptions = {
    type: 'postgres',
    host: 'localhost',
    port: 5432,
    username: 'motti',
    password: 'mysecretpassword',
    entities: [User],
};

describe('QueryBuilder', () => {
    beforeEach(() => {
        instrumentation.enable();
    });

    afterEach(() => {
        instrumentation.disable();
    });

    it('getManyAndCount', async () => {
        const connection = await typeorm.createConnection(options);
        try {
            const users = await connection
                .createQueryBuilder(User, 'user')
                .where('user.id = :userId')
                .setParameter('userId', '1')
                .getManyAndCount();
            expect(users.length).toBeGreaterThan(0);
            const typeOrmSpans = getTestSpans();
            expect(typeOrmSpans.length).toBe(1);
            expect(typeOrmSpans[0].status.code).toBe(SpanStatusCode.UNSET);
            const attributes = typeOrmSpans[0].attributes;
            expect(attributes[SemanticAttributes.DB_SYSTEM]).toBe(options.type);
            expect(attributes[SemanticAttributes.DB_SYSTEM]).toBe(options.type);
            expect(attributes[SemanticAttributes.DB_USER]).toBe(options.username);
            expect(attributes[SemanticAttributes.NET_PEER_NAME]).toBe(options.host);
            expect(attributes[SemanticAttributes.NET_PEER_PORT]).toBe(options.port);
            expect(attributes[SemanticAttributes.DB_NAME]).toBe(options.database);
            expect(attributes[SemanticAttributes.DB_STATEMENT]).toBe(
                'SELECT "user"."id" AS "user_id", "user"."firstName" AS "user_firstName", "user"."lastName" AS "user_lastName", "user"."isActive" AS "user_isActive" FROM "user" "user" WHERE "user"."id" = $1'
            );
        } finally {
            await connection.close();
        }
    });
});

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

const getTypeormSpans = (): ReadableSpan[] => {
    return getTestSpans().filter((s) => s.attributes['component'] === 'typeorm');
};

describe('QueryBuilder', () => {
    beforeEach(() => {
        instrumentation.enable();
    });

    afterEach(() => {
        instrumentation.disable();
    });

    it('Creates a basic typeorm span', async () => {
        const connection = await typeorm.createConnection(options);
        const users = await connection
            .createQueryBuilder(User, 'user')
            .where('user.id = :userId')
            .setParameter('userId', '123')
            .getMany();
        expect(users.length).toBeGreaterThan(0);
        const typeOrmSpans = getTypeormSpans();
        expect(typeOrmSpans.length).toBe(1);
        expect(typeOrmSpans[0].status.code).toBe(SpanStatusCode.UNSET);
        const attributes = typeOrmSpans[0].attributes;

        expect(attributes['component']).toBe('typeorm');
        expect(attributes[SemanticAttributes.DB_SYSTEM]).toBe(options.type);
        expect(attributes[SemanticAttributes.DB_USER]).toBe(options.username);
        expect(attributes[SemanticAttributes.NET_PEER_NAME]).toBe(options.host);
        expect(attributes[SemanticAttributes.NET_PEER_PORT]).toBe(options.port);
        expect(attributes[SemanticAttributes.DB_NAME]).toBe(options.database);
        expect(attributes[SemanticAttributes.DB_STATEMENT]).toBe(
            'SELECT "user"."id" AS "user_id", "user"."name" AS "user_name" FROM "user" "user" WHERE "user"."id" = $1'
        );

        await connection.close();
    });
});

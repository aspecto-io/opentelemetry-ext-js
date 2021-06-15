import 'mocha';
import expect from 'expect';
import { TypeormInstrumentation, TypeormInstrumentationConfig } from '../src';
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

describe('Repository', () => {
    beforeEach(() => {
        instrumentation.enable();
    });

    afterEach(() => {
        instrumentation.disable();
    });

    it('findAndCount enableInternalInstrumentation:false', async () => {
        const conn = await typeorm.createConnection(options);
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

    it('findAndCount enableInternalInstrumentation:true', async () => {
        const config: TypeormInstrumentationConfig = { enableInternalInstrumentation: true };
        instrumentation.setConfig(config);
        const conn = await typeorm.createConnection(options);
        try {
            const repo = conn.getRepository(User);
            const [users, count] = await repo.findAndCount();
            expect(count).toBeGreaterThan(0);

            const spans = getTestSpans();
            expect(spans.length).toEqual(2);
        } finally {
            await conn.close();
        }
    });
});

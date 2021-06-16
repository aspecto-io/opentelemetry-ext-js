import { trace, context as ctx } from '@opentelemetry/api';
import * as typeorm from 'typeorm';
import { isTypeormInternalTracingSuppressed } from '../src/utils';

const originalCreate = typeorm.ConnectionManager.prototype.create;

export const setMocks = () => {
    const emptySuccessFunc = async (_argName: any) => {};
    const successFuncWithPayload = async () => ({ foo: 'goo' });
    const errorFunc = async () => {
        throw new Error('some error');
    };

    const createManager = (connectionOptions: any) => {
        return {
            connection: {
                options: connectionOptions,
            },
            save: emptySuccessFunc,
            remove: successFuncWithPayload,
            find: errorFunc,
            findAndCount: async () => {
                if (!isTypeormInternalTracingSuppressed(ctx.active())) {
                    trace.getTracerProvider().getTracer('default').startSpan('child span of findAndCount').end();
                }
                return [[{ foo: 'goo' }], 1];
            },
        };
    };

    typeorm.ConnectionManager.prototype.create = ((options: any) => {
        const manager = createManager(options);
        return {
            connect: () => ({ manager }),
            manager,
        };
    }) as any;
};

export const resetMocks = () => {
    typeorm.ConnectionManager.prototype.create = originalCreate;
};

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

export const localPostgreSQLOptions: typeorm.ConnectionOptions = {
    type: 'postgres',
    host: 'localhost',
    port: 5432,
    username: 'aspecto',
    password: 'mysecretpassword',
    entities: [User],
};

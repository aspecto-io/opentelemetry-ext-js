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
    const findAndCountFunc = async () => {
        if (!isTypeormInternalTracingSuppressed(ctx.active())) {
            trace.getTracerProvider().getTracer('default').startSpan('child span of findAndCount').end();
        }
        return [[{ foo: 'goo' }], 1];
    };

    const createManager = (connectionOptions: any) => {
        return {
            connection: {
                options: connectionOptions,
            },
            save: emptySuccessFunc,
            remove: successFuncWithPayload,
            find: errorFunc,
            findAndCount: findAndCountFunc,
        };
    };

    const getRepository = () => {
        return {
            findAndCount: findAndCountFunc,
        };
    };

    typeorm.ConnectionManager.prototype.create = ((options: any) => {
        const manager = createManager(options);
        const driver = {
            escape: (s) => s,
            escapeQueryWithParameters: (sql: string, parameters: any, nativeParameters: any) => [sql, [parameters]],
            normalizeType: (column: any) => 'varchar',
            supportedDataTypes: ['varchar'],
        } as typeorm.Driver;

        const connection = new typeorm.Connection(options) as any;
        connection.manager = manager;
        connection.getRepository = getRepository;
        connection.driver = driver;
        connection.buildMetadatas();
        return {
            connect: () => connection,
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

export const defaultOptions: typeorm.ConnectionOptions = {
    type: 'postgres',
    host: 'localhost',
    port: 5432,
    username: 'aspecto',
    password: 'mysecretpassword',
    entities: [User],
};

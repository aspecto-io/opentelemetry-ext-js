import { InMemorySpanExporter, SimpleSpanProcessor, ReadableSpan, Span } from '@opentelemetry/tracing';
import { NodeTracerProvider } from '@opentelemetry/node';
import { context, StatusCode, NoopLogger } from '@opentelemetry/api';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import { ContextManager } from '@opentelemetry/context-base';
import { DatabaseAttribute, GeneralAttribute } from '@opentelemetry/semantic-conventions';
import { TypeormInstrumentation } from '../src';
import expect from 'expect';
const logger = new NoopLogger();
const instrumentation = new TypeormInstrumentation({ logger });

import * as typeorm from 'typeorm';

const setMocks = () => {
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

describe('instrumentation-typeorm', () => {
    const provider = new NodeTracerProvider();
    const memoryExporter = new InMemorySpanExporter();
    const spanProcessor = new SimpleSpanProcessor(memoryExporter);
    provider.addSpanProcessor(spanProcessor);
    instrumentation.setTracerProvider(provider);
    let contextManager: ContextManager;

    const getTypeormSpans = (): ReadableSpan[] => {
        return memoryExporter.getFinishedSpans().filter((s) => s.attributes['component'] === 'typeorm');
    };

    beforeEach(() => {
        contextManager = new AsyncHooksContextManager();
        context.setGlobalContextManager(contextManager.enable());
        setMocks();
        instrumentation.enable();
    });

    afterEach(() => {
        memoryExporter.reset();
        contextManager.disable();
        instrumentation.disable();
    });

    describe('single connection', () => {
        const options: typeorm.ConnectionOptions = {
            type: 'postgres',
            host: 'some-host',
            port: 1234,
            username: 'some-user',
            database: 'my-db',
        };

        it('Mock for save works', async () => {
            const connection = await typeorm.createConnection({
                type: 'postgres',
                host: 'some-host',
                port: 1234,
            });
            await connection.manager.save({});
        });

        it('Creates a basic typeorm span', async () => {
            const connection = await typeorm.createConnection(options);
            const statement = { test: 123 };
            await connection.manager.save(statement);
            const typeOrmSpans = getTypeormSpans();

            expect(typeOrmSpans.length).toBe(1);
            expect(typeOrmSpans[0].status.code).toBe(StatusCode.UNSET);
            const attributes = typeOrmSpans[0].attributes;

            expect(attributes['component']).toBe('typeorm');
            expect(attributes[DatabaseAttribute.DB_SYSTEM]).toBe(options.type);
            expect(attributes[DatabaseAttribute.DB_USER]).toBe(options.username);
            expect(attributes[GeneralAttribute.NET_PEER_NAME]).toBe(options.host);
            expect(attributes[GeneralAttribute.NET_PEER_PORT]).toBe(options.port);
            expect(attributes[DatabaseAttribute.DB_NAME]).toBe(options.database);
            expect(attributes[DatabaseAttribute.DB_OPERATION]).toBe('save');
            expect(attributes[DatabaseAttribute.DB_STATEMENT]).toBe(JSON.stringify({ _argName: statement }));
        });

        it('Sets failure status when function throws', async () => {
            const connection = await typeorm.createConnection(options);
            try {
                await connection.manager.find({} as any);
            } catch (err) {}

            const typeOrmSpans = getTypeormSpans();
            expect(typeOrmSpans.length).toBe(1);
            expect(typeOrmSpans[0].status.code).toBe(StatusCode.ERROR);
            expect(typeOrmSpans[0].status.message).toBe('some error');
        });

        it('responseHook works', async () => {
            setMocks();
            instrumentation.disable();
            instrumentation.setConfig({
                responseHook: (span: Span, response: any) => {
                    span.setAttribute('test', JSON.stringify(response));
                },
            });
            instrumentation.enable();

            const connection = await typeorm.createConnection(options);
            const statement = { test: 123 };
            await connection.manager.remove(statement);
            const typeOrmSpans = getTypeormSpans();

            expect(typeOrmSpans.length).toBe(1);
            const attributes = typeOrmSpans[0].attributes;

            expect(attributes['test']).toBe(JSON.stringify({ foo: 'goo' }));
            expect(attributes['component']).toBe('typeorm');
            expect(attributes[DatabaseAttribute.DB_OPERATION]).toBe('remove');
            expect(attributes[DatabaseAttribute.DB_SYSTEM]).toBe(options.type);
        });
    });

    describe('multiple connections', () => {
        const options1: typeorm.ConnectionOptions = {
            type: 'postgres',
            host: 'some-host',
            port: 1234,
            username: 'some-user',
            database: 'my-db',
        };

        const options2: typeorm.ConnectionOptions = {
            type: 'mysql',
            host: 'other-host',
            port: 1234,
            username: 'cool-user',
            database: 'his-db',
        };

        it('appends matching connection details to span', async () => {
            const [postgres, mysql] = await typeorm.createConnections([options1, options2]);

            await postgres.manager.save({});
            await mysql.manager.remove({});

            const spans = getTypeormSpans();
            expect(spans.length).toBe(2);
            const postgresSpan = spans[0];
            const mySqlSpan = spans[1];

            expect(postgresSpan.attributes['component']).toBe('typeorm');
            expect(postgresSpan.attributes[DatabaseAttribute.DB_SYSTEM]).toBe(options1.type);
            expect(postgresSpan.attributes[DatabaseAttribute.DB_USER]).toBe(options1.username);
            expect(postgresSpan.attributes[GeneralAttribute.NET_PEER_NAME]).toBe(options1.host);
            expect(postgresSpan.attributes[GeneralAttribute.NET_PEER_PORT]).toBe(options1.port);
            expect(postgresSpan.attributes[DatabaseAttribute.DB_NAME]).toBe(options1.database);
            expect(postgresSpan.attributes[DatabaseAttribute.DB_OPERATION]).toBe('save');

            expect(mySqlSpan.attributes['component']).toBe('typeorm');
            expect(mySqlSpan.attributes[DatabaseAttribute.DB_SYSTEM]).toBe(options2.type);
            expect(mySqlSpan.attributes[DatabaseAttribute.DB_USER]).toBe(options2.username);
            expect(mySqlSpan.attributes[GeneralAttribute.NET_PEER_NAME]).toBe(options2.host);
            expect(mySqlSpan.attributes[GeneralAttribute.NET_PEER_PORT]).toBe(options2.port);
            expect(mySqlSpan.attributes[DatabaseAttribute.DB_NAME]).toBe(options2.database);
            expect(mySqlSpan.attributes[DatabaseAttribute.DB_OPERATION]).toBe('remove');
        });
    });
});

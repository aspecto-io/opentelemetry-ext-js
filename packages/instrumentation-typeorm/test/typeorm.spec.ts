import 'mocha';
import expect from 'expect';
import { ReadableSpan, Span } from '@opentelemetry/tracing';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { TypeormInstrumentation } from '../src';
import { getTestSpans } from 'opentelemetry-instrumentation-testing-utils';
const instrumentation = new TypeormInstrumentation();

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
    instrumentation.setTracerProvider(trace.getTracerProvider());

    const getTypeormSpans = (): ReadableSpan[] => {
        return getTestSpans().filter((s) => s.attributes['component'] === 'typeorm');
    };

    beforeEach(() => {
        setMocks();
        instrumentation.enable();
    });

    afterEach(() => {
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
            expect(typeOrmSpans[0].status.code).toBe(SpanStatusCode.UNSET);
            const attributes = typeOrmSpans[0].attributes;

            expect(attributes['component']).toBe('typeorm');
            expect(attributes[SemanticAttributes.DB_SYSTEM]).toBe(options.type);
            expect(attributes[SemanticAttributes.DB_USER]).toBe(options.username);
            expect(attributes[SemanticAttributes.NET_PEER_NAME]).toBe(options.host);
            expect(attributes[SemanticAttributes.NET_PEER_PORT]).toBe(options.port);
            expect(attributes[SemanticAttributes.DB_NAME]).toBe(options.database);
            expect(attributes[SemanticAttributes.DB_OPERATION]).toBe('save');
            expect(attributes[SemanticAttributes.DB_STATEMENT]).toBe(JSON.stringify({ _argName: statement }));
        });

        it('Sets failure status when function throws', async () => {
            const connection = await typeorm.createConnection(options);
            try {
                await connection.manager.find({} as any);
            } catch (err) {}

            const typeOrmSpans = getTypeormSpans();
            expect(typeOrmSpans.length).toBe(1);
            expect(typeOrmSpans[0].status.code).toBe(SpanStatusCode.ERROR);
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
            expect(attributes[SemanticAttributes.DB_OPERATION]).toBe('remove');
            expect(attributes[SemanticAttributes.DB_SYSTEM]).toBe(options.type);
        });

        it('moduleVersionAttributeName works', async () => {
            setMocks();
            instrumentation.disable();
            instrumentation.setConfig({
                moduleVersionAttributeName: 'module.version',
            });
            instrumentation.enable();

            const connection = await typeorm.createConnection(options);
            const statement = { test: 123 };
            await connection.manager.remove(statement);
            const typeOrmSpans = getTypeormSpans();

            expect(typeOrmSpans.length).toBe(1);
            const attributes = typeOrmSpans[0].attributes;
            expect(attributes['module.version']).toMatch(/\d{1,4}\.\d{1,4}\.\d{1,5}.*/);
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
            expect(postgresSpan.attributes[SemanticAttributes.DB_SYSTEM]).toBe(options1.type);
            expect(postgresSpan.attributes[SemanticAttributes.DB_USER]).toBe(options1.username);
            expect(postgresSpan.attributes[SemanticAttributes.NET_PEER_NAME]).toBe(options1.host);
            expect(postgresSpan.attributes[SemanticAttributes.NET_PEER_PORT]).toBe(options1.port);
            expect(postgresSpan.attributes[SemanticAttributes.DB_NAME]).toBe(options1.database);
            expect(postgresSpan.attributes[SemanticAttributes.DB_OPERATION]).toBe('save');

            expect(mySqlSpan.attributes['component']).toBe('typeorm');
            expect(mySqlSpan.attributes[SemanticAttributes.DB_SYSTEM]).toBe(options2.type);
            expect(mySqlSpan.attributes[SemanticAttributes.DB_USER]).toBe(options2.username);
            expect(mySqlSpan.attributes[SemanticAttributes.NET_PEER_NAME]).toBe(options2.host);
            expect(mySqlSpan.attributes[SemanticAttributes.NET_PEER_PORT]).toBe(options2.port);
            expect(mySqlSpan.attributes[SemanticAttributes.DB_NAME]).toBe(options2.database);
            expect(mySqlSpan.attributes[SemanticAttributes.DB_OPERATION]).toBe('remove');
        });
    });
});

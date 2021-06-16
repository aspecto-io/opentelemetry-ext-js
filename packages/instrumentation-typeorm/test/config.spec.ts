import 'mocha';
import expect from 'expect';
import { Span } from '@opentelemetry/tracing';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { TypeormInstrumentation, TypeormInstrumentationConfig } from '../src';
import { getTestSpans } from 'opentelemetry-instrumentation-testing-utils';

const instrumentation = new TypeormInstrumentation();
import * as typeorm from 'typeorm';
import { setMocks, localPostgreSQLOptions, User } from './utils';

describe('TypeormInstrumentationConfig', () => {
    it('responseHook', async () => {
        setMocks();
        instrumentation.disable();
        const config: TypeormInstrumentationConfig = {
            responseHook: (span: Span, response: any) => {
                span.setAttribute('test', JSON.stringify(response));
            },
        };
        instrumentation.setConfig(config);
        instrumentation.enable();

        const connection = await typeorm.createConnection(localPostgreSQLOptions);
        const statement = { test: 123 };
        await connection.manager.remove(statement);
        const typeOrmSpans = getTestSpans();

        expect(typeOrmSpans.length).toBe(1);
        const attributes = typeOrmSpans[0].attributes;

        expect(attributes['test']).toBe(JSON.stringify({ foo: 'goo' }));
        expect(attributes[SemanticAttributes.DB_OPERATION]).toBe('remove');
        expect(attributes[SemanticAttributes.DB_SYSTEM]).toBe(localPostgreSQLOptions.type);
    });

    it('moduleVersionAttributeName works', async () => {
        setMocks();
        instrumentation.disable();
        const config: TypeormInstrumentationConfig = {
            moduleVersionAttributeName: 'module.version',
        };
        instrumentation.setConfig(config);
        instrumentation.enable();

        const connection = await typeorm.createConnection(localPostgreSQLOptions);
        const statement = { test: 123 };
        await connection.manager.remove(statement);
        const typeOrmSpans = getTestSpans();

        expect(typeOrmSpans.length).toBe(1);
        const attributes = typeOrmSpans[0].attributes;
        expect(attributes['module.version']).toMatch(/\d{1,4}\.\d{1,4}\.\d{1,5}.*/);
    });

    it('enableInternalInstrumentation:true', async () => {
        const config: TypeormInstrumentationConfig = { enableInternalInstrumentation: true };
        instrumentation.setConfig(config);
        const conn = await typeorm.createConnection(localPostgreSQLOptions);
        const [users, count] = await conn.manager.findAndCount(User);
        expect(count).toBeGreaterThan(0);

        const spans = getTestSpans();
        expect(spans.length).toEqual(2);
    });

    it('enableInternalInstrumentation:false', async () => {
        const config: TypeormInstrumentationConfig = { enableInternalInstrumentation: false };
        instrumentation.setConfig(config);
        const conn = await typeorm.createConnection(localPostgreSQLOptions);
        const [users, count] = await conn.manager.findAndCount(User);
        expect(count).toBeGreaterThan(0);

        const spans = getTestSpans();
        expect(spans.length).toEqual(1);
    });
});

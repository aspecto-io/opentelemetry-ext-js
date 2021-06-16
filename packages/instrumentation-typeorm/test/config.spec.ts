import 'mocha';
import expect from 'expect';
import { Span } from '@opentelemetry/tracing';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { TypeormInstrumentation, TypeormInstrumentationConfig } from '../src';
import { getTestSpans } from 'opentelemetry-instrumentation-testing-utils';

const instrumentation = new TypeormInstrumentation();
import * as typeorm from 'typeorm';
import { defaultOptions, User } from './utils';

describe('TypeormInstrumentationConfig', () => {
    it('responseHook', async () => {
        instrumentation.disable();
        const config: TypeormInstrumentationConfig = {
            responseHook: (span: Span, response: any) => {
                span.setAttribute('test', JSON.stringify(response));
            },
        };
        instrumentation.setConfig(config);
        instrumentation.enable();

        const connection = await typeorm.createConnection(defaultOptions);
        const user = new User(1, 'aspecto', 'io');
        await connection.manager.save(user);
        const typeOrmSpans = getTestSpans();
        expect(typeOrmSpans.length).toBe(1);
        const attributes = typeOrmSpans[0].attributes;

        expect(attributes['test']).toBe(JSON.stringify(user));
        expect(attributes[SemanticAttributes.DB_OPERATION]).toBe('save');
        expect(attributes[SemanticAttributes.DB_SYSTEM]).toBe(defaultOptions.type);
        await connection.close();
    });

    it('moduleVersionAttributeName works', async () => {
        instrumentation.disable();
        const config: TypeormInstrumentationConfig = {
            moduleVersionAttributeName: 'module.version',
        };
        instrumentation.setConfig(config);
        instrumentation.enable();

        const connection = await typeorm.createConnection(defaultOptions);
        const user = new User(1, 'aspecto', 'io');
        await connection.manager.save(user);
        const typeOrmSpans = getTestSpans();

        expect(typeOrmSpans.length).toBe(1);
        const attributes = typeOrmSpans[0].attributes;
        expect(attributes['module.version']).toMatch(/\d{1,4}\.\d{1,4}\.\d{1,5}.*/);
        await connection.close();
    });

    it('enableInternalInstrumentation:true', async () => {
        const config: TypeormInstrumentationConfig = { enableInternalInstrumentation: true };
        instrumentation.setConfig(config);
        const connection = await typeorm.createConnection(defaultOptions);
        const [users, count] = await connection.manager.findAndCount(User);
        const spans = getTestSpans();
        expect(spans.length).toEqual(2);

        const findAndCountSpan = spans.find(s => s.name.indexOf('findAndCount') !== -1);
        expect(findAndCountSpan).not.toBeUndefined();
        expect(findAndCountSpan.attributes[SemanticAttributes.DB_OPERATION]).toBe('findAndCount');
        expect(findAndCountSpan.attributes[SemanticAttributes.DB_SQL_TABLE]).toBe('user');

        const selectSpan = spans.find(s => s.name.indexOf('select') !== -1);
        expect(selectSpan).not.toBeUndefined();
        expect(selectSpan.attributes[SemanticAttributes.DB_OPERATION]).toBe('select');
        expect(selectSpan.attributes[SemanticAttributes.DB_SQL_TABLE]).toBe('user');
        await connection.close();
    });

    it('enableInternalInstrumentation:false', async () => {
        const config: TypeormInstrumentationConfig = { enableInternalInstrumentation: false };
        instrumentation.setConfig(config);
        const connection = await typeorm.createConnection(defaultOptions);
        const [users, count] = await connection.manager.findAndCount(User);
        const spans = getTestSpans();
        expect(spans.length).toEqual(1);
        const attributes = spans[0].attributes;
        expect(attributes[SemanticAttributes.DB_OPERATION]).toBe('findAndCount');
        expect(attributes[SemanticAttributes.DB_SYSTEM]).toBe(defaultOptions.type);
        await connection.close();
    });
});

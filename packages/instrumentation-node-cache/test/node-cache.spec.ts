import 'mocha';
import expect from 'expect';
import { getTestSpans, resetMemoryExporter, registerInstrumentationTesting } from '@opentelemetry/contrib-test-utils';
import { NodeCacheInstrumentation, NodeCacheInstrumentationConfig } from '../src';
import { context, ROOT_CONTEXT } from '@opentelemetry/api';

const DB_RESPONSE = 'db.response';
const instrumentation = registerInstrumentationTesting(new NodeCacheInstrumentation());
instrumentation.enable();

import NodeCache from 'node-cache';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';

describe('node-cache instrumentation', () => {
    let cache = new NodeCache();

    const getSingleSpan = () => {
        const spans = getTestSpans();
        expect(spans.length).toBe(1);
        return spans[0];
    };

    beforeEach(async () => {
        resetMemoryExporter();
        cache = new NodeCache();
        instrumentation.setConfig({
            responseHook: (span, { response }) =>
                span.setAttribute(DB_RESPONSE, typeof response === 'object' ? JSON.stringify(response) : response),
        });
        instrumentation.enable();
    });

    afterEach(async () => {
        instrumentation.disable();
    });

    describe('instruments functions', () => {
        it('set', () => {
            cache.set('some-key', 'cool');
            const span = getSingleSpan();

            expect(span.name).toBe('node-cache set');
            expect(span.attributes[SemanticAttributes.DB_SYSTEM]).toBe('node-cache');
            expect(span.attributes[SemanticAttributes.DB_OPERATION]).toBe('set');
            expect(span.attributes[DB_RESPONSE]).toBe(true);
        });

        it('get', () => {
            cache.set('some-key', 'some-value');
            resetMemoryExporter();
            cache.get('some-key');
            const span = getSingleSpan();

            expect(span.name).toBe('node-cache get');
            expect(span.attributes[SemanticAttributes.DB_SYSTEM]).toBe('node-cache');
            expect(span.attributes[SemanticAttributes.DB_OPERATION]).toBe('get');
            expect(span.attributes[SemanticAttributes.DB_STATEMENT]).toBe('get some-key');
            expect(span.attributes[DB_RESPONSE]).toBe('some-value');
        });

        it('has', () => {
            cache.has('some-key');
            const span = getSingleSpan();

            expect(span.name).toBe('node-cache has');
            expect(span.attributes[SemanticAttributes.DB_SYSTEM]).toBe('node-cache');
            expect(span.attributes[SemanticAttributes.DB_OPERATION]).toBe('has');
            expect(span.attributes[SemanticAttributes.DB_STATEMENT]).toBe('has some-key');
            expect(span.attributes[DB_RESPONSE]).toBe(false);
        });

        it('take', () => {
            cache.set('some-key', 'some-value');
            resetMemoryExporter();
            // Does not exist on versions <= 5.1.1, need to hack this
            if (!cache['take']) return;
            cache['take']('some-key');
            const span = getSingleSpan();

            expect(span.name).toBe('node-cache take');
            expect(span.attributes[SemanticAttributes.DB_SYSTEM]).toBe('node-cache');
            expect(span.attributes[SemanticAttributes.DB_OPERATION]).toBe('take');
            expect(span.attributes[SemanticAttributes.DB_STATEMENT]).toBe('take some-key');
            expect(span.attributes[DB_RESPONSE]).toBe('some-value');
        });

        it('del', () => {
            cache.set('some-key', 'some-value');
            resetMemoryExporter();
            cache.del('some-key');
            const span = getSingleSpan();

            expect(span.name).toBe('node-cache del');
            expect(span.attributes[SemanticAttributes.DB_SYSTEM]).toBe('node-cache');
            expect(span.attributes[SemanticAttributes.DB_OPERATION]).toBe('del');
            expect(span.attributes[SemanticAttributes.DB_STATEMENT]).toBe('del some-key');
            expect(span.attributes[DB_RESPONSE]).toBe(1);
        });

        it('mdel', () => {
            cache.set('some-key', 'some-value');
            cache.set('some-other-key', 'some-value');
            resetMemoryExporter();
            cache.del(['some-key', 'some-other-key']);
            const span = getSingleSpan();

            expect(span.name).toBe('node-cache del');
            expect(span.attributes[SemanticAttributes.DB_SYSTEM]).toBe('node-cache');
            expect(span.attributes[SemanticAttributes.DB_OPERATION]).toBe('del');
            expect(span.attributes[SemanticAttributes.DB_STATEMENT]).toBe('del some-key,some-other-key');
            expect(span.attributes[DB_RESPONSE]).toBe(2);
        });

        it('mget', () => {
            cache.set('a', 'x');
            cache.set('b', 'y');
            resetMemoryExporter();
            const res = cache.mget(['a', 'b', 'c']);
            expect(res).toEqual({ a: 'x', b: 'y' });
            const span = getSingleSpan();

            expect(span.name).toBe('node-cache mget');
            expect(span.attributes[SemanticAttributes.DB_SYSTEM]).toBe('node-cache');
            expect(span.attributes[SemanticAttributes.DB_OPERATION]).toBe('mget');
            expect(span.attributes[SemanticAttributes.DB_STATEMENT]).toBe('mget a,b,c');
            expect(JSON.parse(span.attributes[DB_RESPONSE] as string)).toEqual({ a: 'x', b: 'y' });
        });

        it('mset', () => {
            cache.mset([
                { key: 'a', val: 'x' },
                { key: 'b', val: 'y' },
            ]);
            const span = getSingleSpan();

            expect(span.name).toBe('node-cache mset');
            expect(span.attributes[SemanticAttributes.DB_SYSTEM]).toBe('node-cache');
            expect(span.attributes[SemanticAttributes.DB_OPERATION]).toBe('mset');
            expect(span.attributes[SemanticAttributes.DB_STATEMENT]).toBe('mset a,b');
            expect(span.attributes[DB_RESPONSE]).toEqual(true);
        });

        it('getTtl', () => {
            cache.getTtl('some-key');
            const span = getSingleSpan();

            expect(span.name).toBe('node-cache getTtl');
            expect(span.attributes[SemanticAttributes.DB_SYSTEM]).toBe('node-cache');
            expect(span.attributes[SemanticAttributes.DB_OPERATION]).toBe('getTtl');
            expect(span.attributes[SemanticAttributes.DB_STATEMENT]).toBe('getTtl some-key');
        });

        it('ttl', () => {
            cache.ttl('some-key', 12345);
            const span = getSingleSpan();

            expect(span.name).toBe('node-cache ttl');
            expect(span.attributes[SemanticAttributes.DB_SYSTEM]).toBe('node-cache');
            expect(span.attributes[SemanticAttributes.DB_OPERATION]).toBe('ttl');
            expect(span.attributes[SemanticAttributes.DB_STATEMENT]).toBe('ttl some-key 12345');
        });

        it('flushAll', () => {
            cache.flushAll();
            const span = getSingleSpan();

            expect(span.name).toBe('node-cache flushAll');
            expect(span.attributes[SemanticAttributes.DB_SYSTEM]).toBe('node-cache');
            expect(span.attributes[SemanticAttributes.DB_OPERATION]).toBe('flushAll');
            expect(span.attributes[SemanticAttributes.DB_STATEMENT]).toBe('flushAll');
        });
    });

    describe('requireParentSpan', () => {
        beforeEach(() => {
            instrumentation.disable();
            instrumentation.setConfig({
                requireParentSpan: true,
            });
            instrumentation.enable();
        });

        it('should not start span on node-cache method', () => {
            context.with(ROOT_CONTEXT, () => {
                cache.get('test');
            });
            const spans = getTestSpans();
            expect(spans.length).toBe(0);
        });
    });

    describe('moduleVersionAttributeName', () => {
        const VERSION_ATTR_NAME = 'ver';
        beforeEach(() => {
            instrumentation.disable();
            instrumentation.setConfig({
                requestHook: (span, { moduleVersion }) => {
                    span.setAttribute(VERSION_ATTR_NAME, moduleVersion);
                },
            });
            instrumentation.enable();
        });

        it('should not start span on node-cache method', () => {
            cache.get('test');
            const span = getSingleSpan();
            expect(span.attributes[VERSION_ATTR_NAME]).toBeDefined();
        });
    });

    describe('requestHook', () => {
        beforeEach(() => {
            instrumentation.disable();
            instrumentation.setConfig({
                requestHook: (span, { operation, args }) => {
                    if (operation === 'set') {
                        span.setAttribute('db.payload', JSON.stringify({ value: args[1], ttl: args[2] }));
                    }
                    if (operation === 'mset') {
                        span.setAttribute('db.payload', JSON.stringify(args[0]));
                    }
                },
            });
            instrumentation.enable();
        });

        it('captures set payload using requestHook', () => {
            cache.set('some-key', 'some-value', 12345);
            const span = getSingleSpan();
            expect(span.attributes['db.payload']).toBe('{"value":"some-value","ttl":12345}');
        });

        it('captures mset payload using requestHook', () => {
            cache.mset([{ key: 'some-key', val: 'some-val', ttl: 12345 }]);
            const span = getSingleSpan();
            expect(span.attributes['db.payload']).toBe('[{"key":"some-key","val":"some-val","ttl":12345}]');
        });
    });
});

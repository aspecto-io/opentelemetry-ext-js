import 'mocha';
import expect from 'expect';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/tracing';
import { NodeTracerProvider } from '@opentelemetry/node';
import { context, setSpan, SpanStatusCode } from '@opentelemetry/api';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import { Neo4jInstrumentation } from '../src';
import { assertSpan } from './assert';
import { DatabaseAttribute } from '@opentelemetry/semantic-conventions';
import { normalizeResponse } from './test-utils';

const instrumentation = new Neo4jInstrumentation();
instrumentation.enable();
instrumentation.disable();

import neo4j, { Driver } from 'neo4j-driver';

describe('neo4j instrumentation', () => {
    const provider = new NodeTracerProvider();
    const memoryExporter = new InMemorySpanExporter();
    const spanProcessor = new SimpleSpanProcessor(memoryExporter);
    provider.addSpanProcessor(spanProcessor);
    instrumentation.setTracerProvider(provider);
    let driver: Driver;

    const getSpans = () => memoryExporter.getFinishedSpans();
    const getSingleSpan = () => {
        const spans = getSpans();
        expect(spans.length).toBe(1);
        return spans[0];
    };

    before(async () => {
        driver = neo4j.driver('bolt://localhost:7687', neo4j.auth.basic('neo4j', 'flows'), {
            disableLosslessIntegers: true,
        });
        await driver.verifyConnectivity();
    });

    after(async () => {
        await driver.close();
    });

    beforeEach(async () => {
        await driver.session().run('MATCH (n) DETACH DELETE n');
        context.setGlobalContextManager(new AsyncHooksContextManager().enable());
        instrumentation.enable();
    });

    afterEach(async () => {
        memoryExporter.reset();
        context.disable();
        instrumentation.disable();
        instrumentation.setConfig({});
    });

    describe('session', () => {
        it('instruments "run" with promise', async () => {
            const res = await driver.session().run('CREATE (n:MyLabel) RETURN n');

            expect(res.records.length).toBe(1);
            expect(res.records[0].toObject().n.labels).toEqual(['MyLabel']);

            const span = getSingleSpan();
            assertSpan(span);
            expect(span.attributes[DatabaseAttribute.DB_OPERATION]).toBe('CREATE');
            expect(span.attributes[DatabaseAttribute.DB_STATEMENT]).toBe('CREATE (n:MyLabel) RETURN n');
        });

        it('instruments "run" with subscribe', (done) => {
            driver
                .session()
                .run('CREATE (n:MyLabel) RETURN n')
                .subscribe({
                    onCompleted: () => {
                        const span = getSingleSpan();
                        assertSpan(span);
                        expect(span.attributes[DatabaseAttribute.DB_OPERATION]).toBe('CREATE');
                        expect(span.attributes[DatabaseAttribute.DB_STATEMENT]).toBe('CREATE (n:MyLabel) RETURN n');
                        done();
                    },
                });
        });

        it('handles "run" exceptions with promise', async () => {
            try {
                await driver.session().run('NOT_EXISTS_OPERATION');
            } catch (err) {
                const span = getSingleSpan();
                expect(span.status.code).toBe(SpanStatusCode.ERROR);
                expect(span.status.message).toBe(err.message);
                return;
            }
            throw Error('should not be here');
        });

        it('handles "run" exceptions with subscribe', (done) => {
            driver
                .session()
                .run('NOT_EXISTS_OPERATION')
                .subscribe({
                    onError: (err) => {
                        const span = getSingleSpan();
                        expect(span.status.code).toBe(SpanStatusCode.ERROR);
                        expect(span.status.message).toBe(err.message);
                        done();
                    },
                });
        });

        it('closes span when on "onKeys" event', (done) => {
            driver
                .session()
                .run('MATCH (n) RETURN n')
                .subscribe({
                    onKeys: (keys) => {
                        const span = getSingleSpan();
                        assertSpan(span);
                        expect(keys).toEqual(['n']);
                        done();
                    },
                });
        });

        it('handles multiple promises', async () => {
            await Promise.all([
                driver.session().run('MATCH (n) RETURN n'),
                driver.session().run('MATCH (k) RETURN k'),
                driver.session().run('MATCH (d) RETURN d'),
            ]);
            const spans = getSpans();
            expect(spans.length).toBe(3);
            for (let span of spans) {
                assertSpan(span);
                expect(span.attributes[DatabaseAttribute.DB_OPERATION]).toBe('MATCH');
            }
        });

        it('set module versions when config is set', async () => {
            instrumentation.disable();
            instrumentation.setConfig({ moduleVersionAttributeName: 'module.version' });
            instrumentation.enable();
            await driver.session().run('CREATE (n:MyLabel) RETURN n');

            const span = getSingleSpan();
            expect(span.attributes['module.version']).toMatch(/\d{1,4}\.\d{1,4}\.\d{1,5}.*/);
        });

        it('does not capture any span when ignoreOrphanedSpans is set to true', async () => {
            instrumentation.disable();
            instrumentation.setConfig({ ignoreOrphanedSpans: true });
            instrumentation.enable();
            await driver.session().run('CREATE (n:MyLabel) RETURN n');

            const spans = getSpans();
            expect(spans.length).toBe(0);
        });

        it('does capture span when ignoreOrphanedSpans is set to true and has parent span', async () => {
            instrumentation.disable();
            instrumentation.setConfig({ ignoreOrphanedSpans: true });
            instrumentation.enable();
            const parent = provider.getTracer('test-tracer').startSpan('main');
            await context.with(setSpan(context.active(), parent), () => 
                driver.session().run('CREATE (n:MyLabel) RETURN n')
            )

            const spans = getSpans();
            expect(spans.length).toBe(1);
        });

        it('responseHook works with promise', async () => {
            instrumentation.disable();
            instrumentation.setConfig({
                responseHook: (span, response) => {
                    span.setAttribute('db.response', normalizeResponse(response));
                },
            });
            instrumentation.enable();

            const res = await driver
                .session()
                .run('CREATE (n:Rick), (b:Meeseeks { purpose: "help"}), (c:Morty) RETURN *');
            expect(res.records.length).toBe(1);

            const span = getSingleSpan();
            assertSpan(span);
            expect(JSON.parse(span.attributes['db.response'] as string)).toEqual([
                {
                    b: { labels: ['Meeseeks'], properties: { purpose: 'help' } },
                    c: { labels: ['Morty'], properties: {} },
                    n: { labels: ['Rick'], properties: {} },
                },
            ]);
        });

        it('responseHook works with subscribe', (done) => {
            instrumentation.disable();
            instrumentation.setConfig({
                responseHook: (span, response) => {
                    span.setAttribute('db.response', normalizeResponse(response));
                },
            });
            instrumentation.enable();

            driver
                .session()
                .run('CREATE (n:Rick), (b:Meeseeks { purpose: "help"}), (c:Morty) RETURN *')
                .subscribe({
                    onCompleted: () => {
                        const span = getSingleSpan();
                        assertSpan(span);
                        expect(JSON.parse(span.attributes['db.response'] as string)).toEqual([
                            {
                                b: { labels: ['Meeseeks'], properties: { purpose: 'help' } },
                                c: { labels: ['Morty'], properties: {} },
                                n: { labels: ['Rick'], properties: {} },
                            },
                        ]);
                        done();
                    },
                });
        });

        it('does not fail when responseHook throws', async () => {
            instrumentation.disable();
            instrumentation.setConfig({
                responseHook: () => {
                    throw new Error('I throw..')
                },
            });
            instrumentation.enable();
            await driver.session().run('CREATE (n:MyLabel) RETURN n');
            const span = getSingleSpan();
            assertSpan(span);
        });
    });
});

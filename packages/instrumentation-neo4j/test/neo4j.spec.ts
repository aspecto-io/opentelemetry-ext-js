import 'mocha';
import expect from 'expect';
import { context, ROOT_CONTEXT, SpanStatusCode, trace } from '@opentelemetry/api';
import { Neo4jInstrumentation } from '../src';
import { assertSpan } from './assert';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { normalizeResponse } from './test-utils';
import { map, mergeMap } from 'rxjs/operators';
import { concat } from 'rxjs';
import { getTestSpans, registerInstrumentationTesting } from '@opentelemetry/contrib-test-utils';

const instrumentation = registerInstrumentationTesting(new Neo4jInstrumentation());
instrumentation.enable();
instrumentation.disable();

import neo4j, { Driver } from 'neo4j-driver';
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';

/**
 * Tests require neo4j to run, and expose bolt port of 11011
 *
 * Use this command to run the required neo4j using docker:
 * docker run --name testneo4j -p7474:7474 -p11011:7687 -d --env NEO4J_AUTH=neo4j/test neo4j:4.2.3
 * */

describe('neo4j instrumentation', function () {
    this.timeout(10000);
    let driver: Driver;

    const getSingleSpan = () => {
        const spans = getTestSpans();
        expect(spans.length).toBe(1);
        return spans[0];
    };

    before(async () => {
        driver = neo4j.driver('bolt://localhost:11011', neo4j.auth.basic('neo4j', 'test'), {
            disableLosslessIntegers: true,
        });

        let keepChecking = true;
        const timeoutId = setTimeout(() => {
            keepChecking = false;
        }, 8000);
        while (keepChecking) {
            try {
                await driver.verifyConnectivity();
                clearTimeout(timeoutId);
                return;
            } catch (err) {
                await new Promise((res) => setTimeout(res, 1000));
            }
        }
        throw new Error('Could not connect to neo4j in allowed time frame');
    });

    after(async () => {
        await driver.close();
    });

    beforeEach(async () => {
        await driver.session().run('MATCH (n) DETACH DELETE n');
        instrumentation.enable();
    });

    afterEach(async () => {
        instrumentation.disable();
        instrumentation.setConfig({});
    });

    describe('session', () => {
        it('instruments "run" with promise', async () => {
            const res = await driver.session().run('CREATE (n:MyLabel) RETURN n');

            expect(res.records.length).toBe(1);
            expect((res.records[0].toObject() as any).n.labels).toEqual(['MyLabel']);

            const span = getSingleSpan();
            assertSpan(span as ReadableSpan);
            expect(span.name).toBe('CREATE neo4j');
            expect(span.attributes[SemanticAttributes.DB_OPERATION]).toBe('CREATE');
            expect(span.attributes[SemanticAttributes.DB_STATEMENT]).toBe('CREATE (n:MyLabel) RETURN n');
        });

        it('instruments "run" with subscribe', (done) => {
            driver
                .session()
                .run('CREATE (n:MyLabel) RETURN n')
                .subscribe({
                    onCompleted: () => {
                        const span = getSingleSpan();
                        assertSpan(span as ReadableSpan);
                        expect(span.attributes[SemanticAttributes.DB_OPERATION]).toBe('CREATE');
                        expect(span.attributes[SemanticAttributes.DB_STATEMENT]).toBe('CREATE (n:MyLabel) RETURN n');
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
                        assertSpan(span as ReadableSpan);
                        expect(keys).toEqual(['n']);
                        done();
                    },
                });
        });

        it('when passing "onKeys" and onCompleted, span is closed in onCompleted, and response hook is called', (done) => {
            instrumentation.disable();
            instrumentation.setConfig({ responseHook: (span) => span.setAttribute('test', 'cool') });
            instrumentation.enable();

            driver
                .session()
                .run('MATCH (n) RETURN n')
                .subscribe({
                    onKeys: () => {
                        const spans = getTestSpans();
                        expect(spans.length).toBe(0);
                    },
                    onCompleted: () => {
                        const span = getSingleSpan();
                        assertSpan(span as ReadableSpan);
                        expect(span.attributes['test']).toBe('cool');
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
            const spans = getTestSpans();
            expect(spans.length).toBe(3);
            for (let span of spans) {
                assertSpan(span as ReadableSpan);
                expect(span.attributes[SemanticAttributes.DB_OPERATION]).toBe('MATCH');
            }
        });

        it('captures operation with trailing white spaces', async () => {
            await driver.session().run('  MATCH (k) RETURN k ');
            const span = getSingleSpan();
            expect(span.attributes[SemanticAttributes.DB_OPERATION]).toBe('MATCH');
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
            await context.with(ROOT_CONTEXT, async () => {
                await driver.session().run('CREATE (n:MyLabel) RETURN n');
            });

            const spans = getTestSpans();
            expect(spans.length).toBe(0);
        });

        it('does capture span when ignoreOrphanedSpans is set to true and has parent span', async () => {
            instrumentation.disable();
            instrumentation.setConfig({ ignoreOrphanedSpans: true });
            instrumentation.enable();
            const parent = trace.getTracerProvider().getTracer('test-tracer').startSpan('main');
            await context.with(trace.setSpan(context.active(), parent), () =>
                driver.session().run('CREATE (n:MyLabel) RETURN n')
            );

            const spans = getTestSpans();
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
            assertSpan(span as ReadableSpan);
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
                        assertSpan(span as ReadableSpan);
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
                    throw new Error('I throw..');
                },
            });
            instrumentation.enable();
            await driver.session().run('CREATE (n:MyLabel) RETURN n');
            const span = getSingleSpan();
            assertSpan(span as ReadableSpan);
        });
    });

    describe('transaction', async () => {
        it('instruments session readTransaction', async () => {
            await driver.session().readTransaction((txc) => {
                return txc.run('MATCH (person:Person) RETURN person.name AS name');
            });
            const span = getSingleSpan();
            assertSpan(span as ReadableSpan);
            expect(span.attributes[SemanticAttributes.DB_OPERATION]).toBe('MATCH');
            expect(span.attributes[SemanticAttributes.DB_STATEMENT]).toBe(
                'MATCH (person:Person) RETURN person.name AS name'
            );
        });

        it('instruments session writeTransaction', async () => {
            await driver.session().writeTransaction((txc) => {
                return txc.run('MATCH (person:Person) RETURN person.name AS name');
            });
            const span = getSingleSpan();
            assertSpan(span as ReadableSpan);
            expect(span.attributes[SemanticAttributes.DB_OPERATION]).toBe('MATCH');
            expect(span.attributes[SemanticAttributes.DB_STATEMENT]).toBe(
                'MATCH (person:Person) RETURN person.name AS name'
            );
        });

        it('instruments explicit transactions', async () => {
            const txc = driver.session().beginTransaction();
            await txc.run('MERGE (bob:Person {name: "Bob"}) RETURN bob.name AS name');
            await txc.run('MERGE (adam:Person {name: "Adam"}) RETURN adam.name AS name');
            await txc.commit();

            const spans = getTestSpans();
            expect(spans.length).toBe(2);
        });
    });

    describe('rxSession', () => {
        it('instruments "run"', (done) => {
            driver
                .rxSession()
                .run('MERGE (n:MyLabel) RETURN n')
                .records()
                .subscribe({
                    complete: () => {
                        const span = getSingleSpan();
                        assertSpan(span as ReadableSpan);
                        done();
                    },
                });
        });

        it('works when piping response', (done) => {
            const rxSession = driver.rxSession();
            rxSession
                .run('MERGE (james:Person {name: $nameParam}) RETURN james.name AS name', {
                    nameParam: 'Bob',
                })
                .records()
                .pipe(map((record) => record.get('name')))
                .subscribe({
                    next: () => {},
                    complete: () => {
                        const span = getSingleSpan();
                        assertSpan(span as ReadableSpan);
                        expect(span.attributes[SemanticAttributes.DB_STATEMENT]).toBe(
                            'MERGE (james:Person {name: $nameParam}) RETURN james.name AS name'
                        );
                        done();
                    },
                    error: () => {},
                });
        });

        it('works with response hook', (done) => {
            instrumentation.disable();
            instrumentation.setConfig({
                responseHook: (span, response) => {
                    span.setAttribute('db.response', normalizeResponse(response));
                },
            });
            instrumentation.enable();

            driver
                .rxSession()
                .run('MERGE (n:MyLabel) RETURN n')
                .records()
                .subscribe({
                    complete: () => {
                        const span = getSingleSpan();
                        assertSpan(span as ReadableSpan);
                        expect(span.attributes['db.response']).toBe(`[{"n":{"labels":["MyLabel"],"properties":{}}}]`);
                        done();
                    },
                });
        });
    });

    describe('reactive transaction', () => {
        it('instruments rx session readTransaction', (done) => {
            driver
                .rxSession()
                .readTransaction((txc) =>
                    txc
                        .run('MATCH (person:Person) RETURN person.name AS name')
                        .records()
                        .pipe(map((record) => record.get('name')))
                )
                .subscribe({
                    next: () => {},
                    complete: () => {
                        const span = getSingleSpan();
                        assertSpan(span as ReadableSpan);
                        expect(span.attributes[SemanticAttributes.DB_STATEMENT]).toBe(
                            'MATCH (person:Person) RETURN person.name AS name'
                        );
                        done();
                    },
                    error: () => {},
                });
        });

        it('instruments rx session writeTransaction', (done) => {
            driver
                .rxSession()
                .writeTransaction((txc) =>
                    txc
                        .run('MATCH (person:Person) RETURN person.name AS name')
                        .records()
                        .pipe(map((record) => record.get('name')))
                )
                .subscribe({
                    next: () => {},
                    complete: () => {
                        const span = getSingleSpan();
                        assertSpan(span as ReadableSpan);
                        expect(span.attributes[SemanticAttributes.DB_STATEMENT]).toBe(
                            'MATCH (person:Person) RETURN person.name AS name'
                        );
                        done();
                    },
                    error: () => {},
                });
        });

        it('instruments rx explicit transactions', (done) => {
            driver
                .rxSession()
                .beginTransaction()
                .pipe(
                    mergeMap((txc) =>
                        concat(
                            txc
                                .run('MERGE (bob:Person {name: $nameParam}) RETURN bob.name AS name', {
                                    nameParam: 'Bob',
                                })
                                .records()
                                .pipe(map((r: any) => r.get('name'))),
                            txc
                                .run('MERGE (adam:Person {name: $nameParam}) RETURN adam.name AS name', {
                                    nameParam: 'Adam',
                                })
                                .records()
                                .pipe(map((r: any) => r.get('name'))),
                            txc.commit()
                        )
                    )
                )
                .subscribe({
                    next: () => {},
                    complete: () => {
                        const spans = getTestSpans();
                        expect(spans.length).toBe(2);
                        done();
                    },
                    error: () => {},
                });
        });
    });

    describe('routing mode', () => {
        // When the connection string starts with "neo4j" routing mode is used
        let routingDriver: Driver;
        const version = require('neo4j-driver/package.json').version;
        const shouldCheck = !['4.0.0', '4.0.1', '4.0.2'].includes(version);

        before(() => {
            if (shouldCheck) {
                routingDriver = neo4j.driver('neo4j://localhost:11011', neo4j.auth.basic('neo4j', 'test'));
            }
        });

        after(async () => {
            shouldCheck && (await routingDriver.close());
        });

        it('instruments as expected in routing mode', async () => {
            if (!shouldCheck) {
                // Versions 4.0.0, 4.0.1 and 4.0.2 of neo4j-driver don't allow connection to local neo4j in routing mode.
                console.log(`Skipping unsupported test for version ${version}`);
                return;
            }

            await routingDriver.session().run('CREATE (n:MyLabel) RETURN n');

            const span = getSingleSpan();
            assertSpan(span as ReadableSpan);
        });
    });
});

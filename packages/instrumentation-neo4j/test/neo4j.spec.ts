import 'mocha';
import expect from 'expect';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/tracing';
import { NodeTracerProvider } from '@opentelemetry/node';
import { context } from '@opentelemetry/api';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import { Neo4jInstrumentation } from '../src';
import { assertSpan } from './assert';

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

    before(async () => {
        driver = neo4j.driver('bolt://localhost:7687', neo4j.auth.basic('neo4j', 'flows'));
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
    });

    describe('session', () => {
        it('instruments "run" with promise', async () => {
            const res = await driver.session().run('MATCH (n) RETURN n');

            const spans = getSpans();
            expect(spans.length).toBe(1);
            console.log(spans[0].attributes)
            assertSpan(spans[0]);
        });
    });
});

import 'mocha';
import expect from 'expect';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/tracing';
import { NodeTracerProvider } from '@opentelemetry/node';
import { ElasticsearchInstrumentation } from '../src/elasticsearch';

const instrumentation = new ElasticsearchInstrumentation();

import { Client } from '@elastic/elasticsearch';

describe('elasticsearch instrumentation', () => {
    const provider = new NodeTracerProvider();
    const memoryExporter = new InMemorySpanExporter();
    const spanProcessor = new SimpleSpanProcessor(memoryExporter);
    provider.addSpanProcessor(spanProcessor);
    instrumentation.setTracerProvider(provider);

    before(() => {
        instrumentation.enable();
    });

    after(() => {
        instrumentation.disable();
    });

    beforeEach(() => {
        memoryExporter.reset();
    });
    /*
    it('should create valid span', async () => {
        let client = new Client({ node: 'http://localhost:9200' });

        await client.index({
            index: 'game-of-thrones',
            type: '_doc', // uncomment this line if you are using Elasticsearch ≤ 6
            body: {
                character: 'Ned Stark',
                quote: 'Winter is coming.',
            },
        });

        await client.search({
            index: 'game-of-thrones',
        });

        const spans = memoryExporter.getFinishedSpans();
        expect(spans?.length).toBe(2);
    });

    it('should create another valid span', async () => {
        const client = new Client({ node: 'http://localhost:9200' });
        await client.cluster.getSettings();
        const spans = memoryExporter.getFinishedSpans();

        expect(spans?.length).toBe(1);
    });

    it('should not create spans when instrument disabled', async () => {
        const client = new Client({ node: 'http://localhost:9200' });
        instrumentation.disable();
        await client.cluster.getSettings();
        instrumentation.enable();
        const spans = memoryExporter.getFinishedSpans();
        expect(spans?.length).toBe(0);
    });
*/
});

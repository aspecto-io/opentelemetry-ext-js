import 'mocha';
import nock from 'nock';
import { expect } from 'chai';
import { getTestSpans, registerInstrumentationTesting } from '@opentelemetry/contrib-test-utils';
import { ElasticsearchInstrumentation } from '../src/elasticsearch';

const instrumentation = registerInstrumentationTesting(new ElasticsearchInstrumentation());

import { Client } from '@elastic/elasticsearch';
const esMockUrl = 'http://localhost:9200';
const esNock = nock(esMockUrl);
const client = new Client({ node: esMockUrl });

describe('elasticsearch instrumentation', () => {
    before(() => {
        instrumentation.enable();

        // Handle Elasticsearch product check
        esNock.get('/').reply(200, { version: { number: '7.14.0' } }, { 'x-elastic-product': 'Elasticsearch' });
    });

    after(() => {
        instrumentation.disable();
    });

    it('should create valid span', async () => {
        esNock.get('/the-simpsons/_search').reply(200, {});
        esNock.post('/the-simpsons/_doc').reply(200, {});

        await client.index({
            index: 'the-simpsons',
            type: '_doc',
            body: {
                character: 'Homer Simpson',
                quote: 'Doh!',
            },
        });

        await client.search({
            index: 'the-simpsons',
        });

        const spans = getTestSpans();
        expect(spans?.length).to.equal(2);
        expect(spans[0].attributes).to.deep.equal({
            'db.system': 'elasticsearch',
            'elasticsearch.request.indices': 'the-simpsons',
            'db.operation': 'client.index',
            'db.statement':
                '{"params":{"index":"the-simpsons","type":"_doc","body":{"character":"Homer Simpson","quote":"Doh!"}}}',
            'net.transport': 'IP.TCP',
            'net.peer.name': 'localhost',
            'net.peer.port': '9200',
        });
        expect(spans[1].attributes).to.deep.equal({
            'db.system': 'elasticsearch',
            'elasticsearch.request.indices': 'the-simpsons',
            'db.operation': 'client.search',
            'db.statement': '{"params":{"index":"the-simpsons"}}',
            'net.transport': 'IP.TCP',
            'net.peer.name': 'localhost',
            'net.peer.port': '9200',
        });
    });

    it('should create another valid span', async () => {
        esNock.get('/_cluster/settings').reply(200, {});

        await client.cluster.getSettings();
        const spans = getTestSpans();

        expect(spans?.length).to.equal(1);
        expect(spans[0].attributes).to.deep.equal({
            'db.system': 'elasticsearch',
            'db.operation': 'cluster.getSettings',
            'db.statement': '{"params":{},"options":{}}',
            'net.transport': 'IP.TCP',
            'net.peer.name': 'localhost',
            'net.peer.port': '9200',
        });
    });

    it('should not create spans when instrument disabled', async () => {
        esNock.get('/_cluster/settings').reply(200, {});

        instrumentation.disable();
        await client.cluster.getSettings();
        instrumentation.enable();
        const spans = getTestSpans();
        expect(spans?.length).to.equal(0);
    });
});

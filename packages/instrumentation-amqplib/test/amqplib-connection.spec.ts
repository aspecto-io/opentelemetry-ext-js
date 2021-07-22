import expect from 'expect';
import { TEST_RABBITMQ_HOST, TEST_RABBITMQ_PORT } from './config';
import amqp from 'amqplib';
import { getTestSpans } from '../../instrumentation-testing-utils/dist/src';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';

describe('amqplib instrumentation connection', function () {
    describe('connect with url object', () => {
        it('should extract connection attributes form url options', async function () {
            const testName = this.test.title;
            const conn = await amqp.connect({
                protocol: 'amqp',
                hostname: TEST_RABBITMQ_HOST,
                port: TEST_RABBITMQ_PORT,
            });

            try {
                const channel = await conn.createChannel();
                channel.sendToQueue(testName, Buffer.from('message created only to test connection attributes'));
                const [publishSpan] = getTestSpans();

                expect(publishSpan.attributes[SemanticAttributes.MESSAGING_SYSTEM]).toEqual('rabbitmq');
                expect(publishSpan.attributes[SemanticAttributes.MESSAGING_PROTOCOL]).toEqual('AMQP');
                expect(publishSpan.attributes[SemanticAttributes.MESSAGING_PROTOCOL_VERSION]).toEqual('0.9.1');
                expect(publishSpan.attributes[SemanticAttributes.MESSAGING_URL]).toBeUndefined(); // no url string if value supplied as object
                expect(publishSpan.attributes[SemanticAttributes.NET_PEER_NAME]).toEqual(TEST_RABBITMQ_HOST);
                expect(publishSpan.attributes[SemanticAttributes.NET_PEER_PORT]).toEqual(TEST_RABBITMQ_PORT);
            } finally {
                await conn.close();
            }
        });

        it('should use default protocol', async function () {
            const testName = this.test.title;
            const conn = await amqp.connect({
                hostname: TEST_RABBITMQ_HOST,
                port: TEST_RABBITMQ_PORT,
            });

            try {
                const channel = await conn.createChannel();
                channel.sendToQueue(testName, Buffer.from('message created only to test connection attributes'));
                const [publishSpan] = getTestSpans();
                expect(publishSpan.attributes[SemanticAttributes.MESSAGING_PROTOCOL]).toEqual('AMQP');
            } finally {
                await conn.close();
            }
        });

        it('should use default host', async function () {
            if (TEST_RABBITMQ_HOST !== 'localhost') {
                return;
            }

            const testName = this.test.title;
            const conn = await amqp.connect({
                protocol: 'amqp',
                port: TEST_RABBITMQ_PORT,
            });

            try {
                const channel = await conn.createChannel();
                channel.sendToQueue(testName, Buffer.from('message created only to test connection attributes'));
                const [publishSpan] = getTestSpans();
                expect(publishSpan.attributes[SemanticAttributes.NET_PEER_NAME]).toEqual(TEST_RABBITMQ_HOST);
            } finally {
                await conn.close();
            }
        });
    });

    describe('connect with url string', () => {
        it('should extract connection attributes form url options', async function () {
            const testName = this.test.title;
            const url = `amqp://${TEST_RABBITMQ_HOST}:${TEST_RABBITMQ_PORT}`;
            const conn = await amqp.connect(url);

            try {
                const channel = await conn.createChannel();
                channel.sendToQueue(testName, Buffer.from('message created only to test connection attributes'));
                const [publishSpan] = getTestSpans();

                expect(publishSpan.attributes[SemanticAttributes.MESSAGING_SYSTEM]).toEqual('rabbitmq');
                expect(publishSpan.attributes[SemanticAttributes.MESSAGING_PROTOCOL]).toEqual('AMQP');
                expect(publishSpan.attributes[SemanticAttributes.MESSAGING_PROTOCOL_VERSION]).toEqual('0.9.1');
                expect(publishSpan.attributes[SemanticAttributes.MESSAGING_URL]).toEqual(url);
                expect(publishSpan.attributes[SemanticAttributes.NET_PEER_NAME]).toEqual(TEST_RABBITMQ_HOST);
                expect(publishSpan.attributes[SemanticAttributes.NET_PEER_PORT]).toEqual(TEST_RABBITMQ_PORT);
            } finally {
                await conn.close();
            }
        });
    });
});

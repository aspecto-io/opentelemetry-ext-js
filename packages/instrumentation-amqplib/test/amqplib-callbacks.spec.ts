import 'mocha';
import expect from 'expect';
import { AmqplibInstrumentation } from '../src';

const instrumentation = new AmqplibInstrumentation();
instrumentation.enable();

import amqpCallback from 'amqplib/callback_api';
import { MessagingDestinationKindValues, SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { SpanKind, context } from '@opentelemetry/api';
import { asyncConsume } from './utils';
import { TEST_RABBITMQ_HOST, TEST_RABBITMQ_PORT } from './config';
import { getTestSpans } from 'opentelemetry-instrumentation-testing-utils';

const msgPayload = 'payload from test';
const queueName = 'queue-name-from-unittest';

describe('amqplib instrumentation callback model', function () {
    const url = `amqp://${TEST_RABBITMQ_HOST}:${TEST_RABBITMQ_PORT}`;
    let conn: amqpCallback.Connection;
    before((done) => {
        amqpCallback.connect(url, (err, connection) => {
            conn = connection;
            done();
        });
    });
    after((done) => {
        conn.close(() => done());
    });

    let channel: amqpCallback.Channel;
    beforeEach((done) => {
        conn.createChannel(
            context.bind(context.active(), (err, c) => {
                channel = c;
                // install an error handler, otherwise when we have tests that create error on the channel,
                // it throws and crash process
                channel.on('error', () => {});
                channel.assertQueue(
                    queueName,
                    { durable: false },
                    context.bind(context.active(), (err, ok) => {
                        channel.purgeQueue(
                            queueName,
                            context.bind(context.active(), (err, ok) => {
                                done();
                            })
                        );
                    })
                );
            })
        );
    });

    afterEach((done) => {
        try {
            channel.close((err) => {
                done();
            });
        } catch {}
    });

    it('simple publish and consume from queue callback', (done) => {
        const hadSpaceInBuffer = channel.sendToQueue(queueName, Buffer.from(msgPayload));
        expect(hadSpaceInBuffer).toBeTruthy();

        asyncConsume(channel, queueName, [(msg) => expect(msg.content.toString()).toEqual(msgPayload)], {
            noAck: true,
        }).then(() => {
            const [publishSpan, consumeSpan] = getTestSpans();

            // assert publish span
            expect(publishSpan.kind).toEqual(SpanKind.PRODUCER);
            expect(publishSpan.attributes[SemanticAttributes.MESSAGING_SYSTEM]).toEqual('rabbitmq');
            expect(publishSpan.attributes[SemanticAttributes.MESSAGING_DESTINATION]).toEqual(''); // according to spec: "This will be an empty string if the default exchange is used"
            expect(publishSpan.attributes[SemanticAttributes.MESSAGING_DESTINATION_KIND]).toEqual(
                MessagingDestinationKindValues.TOPIC
            );
            expect(publishSpan.attributes[SemanticAttributes.MESSAGING_RABBITMQ_ROUTING_KEY]).toEqual(queueName);
            expect(publishSpan.attributes[SemanticAttributes.MESSAGING_PROTOCOL]).toEqual('AMQP');
            expect(publishSpan.attributes[SemanticAttributes.MESSAGING_PROTOCOL_VERSION]).toEqual('0.9.1');
            expect(publishSpan.attributes[SemanticAttributes.MESSAGING_URL]).toEqual(url);
            expect(publishSpan.attributes[SemanticAttributes.NET_PEER_NAME]).toEqual(TEST_RABBITMQ_HOST);
            expect(publishSpan.attributes[SemanticAttributes.NET_PEER_PORT]).toEqual(TEST_RABBITMQ_PORT);

            // assert consume span
            expect(consumeSpan.kind).toEqual(SpanKind.CONSUMER);
            expect(consumeSpan.attributes[SemanticAttributes.MESSAGING_SYSTEM]).toEqual('rabbitmq');
            expect(consumeSpan.attributes[SemanticAttributes.MESSAGING_DESTINATION]).toEqual(''); // according to spec: "This will be an empty string if the default exchange is used"
            expect(consumeSpan.attributes[SemanticAttributes.MESSAGING_DESTINATION_KIND]).toEqual(
                MessagingDestinationKindValues.TOPIC
            );
            expect(consumeSpan.attributes[SemanticAttributes.MESSAGING_RABBITMQ_ROUTING_KEY]).toEqual(queueName);
            expect(consumeSpan.attributes[SemanticAttributes.MESSAGING_PROTOCOL]).toEqual('AMQP');
            expect(consumeSpan.attributes[SemanticAttributes.MESSAGING_PROTOCOL_VERSION]).toEqual('0.9.1');
            expect(consumeSpan.attributes[SemanticAttributes.MESSAGING_URL]).toEqual(url);
            expect(consumeSpan.attributes[SemanticAttributes.NET_PEER_NAME]).toEqual(TEST_RABBITMQ_HOST);
            expect(consumeSpan.attributes[SemanticAttributes.NET_PEER_PORT]).toEqual(TEST_RABBITMQ_PORT);

            // assert context propagation
            expect(consumeSpan.spanContext().traceId).toEqual(publishSpan.spanContext().traceId);
            expect(consumeSpan.parentSpanId).toEqual(publishSpan.spanContext().spanId);

            done();
        });
    });

    it('end span with ack sync', (done) => {
        channel.sendToQueue(queueName, Buffer.from(msgPayload));

        asyncConsume(channel, queueName, [(msg) => channel.ack(msg)]).then(() => {
            // assert consumed message span has ended
            expect(getTestSpans().length).toBe(2);
            done();
        });
    });

    it('end span with ack async', (done) => {
        channel.sendToQueue(queueName, Buffer.from(msgPayload));

        asyncConsume(channel, queueName, [
            (msg) =>
                setTimeout(() => {
                    channel.ack(msg);
                    expect(getTestSpans().length).toBe(2);
                    done();
                }, 1),
        ]);
    });
});

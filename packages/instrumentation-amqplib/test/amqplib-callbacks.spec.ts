import 'mocha';
import expect from 'expect';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/tracing';
import { NodeTracerProvider } from '@opentelemetry/node';
import { HttpTraceContext } from '@opentelemetry/core';
import { AmqplibInstrumentation } from '../src';

const instrumentation = new AmqplibInstrumentation();
instrumentation.enable();
import amqpCallback from 'amqplib/callback_api';
import { GeneralAttribute, MessagingAttribute } from '@opentelemetry/semantic-conventions';
import { propagation, Span, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { asyncConsume } from './utils';

const msgPayload = 'payload from test';
const queueName = 'queue-name-from-unittest';

describe('amqplib instrumentation callback model', function () {
    const provider = new NodeTracerProvider();
    const memoryExporter = new InMemorySpanExporter();
    const spanProcessor = new SimpleSpanProcessor(memoryExporter);
    propagation.setGlobalPropagator(new HttpTraceContext());
    provider.addSpanProcessor(spanProcessor);
    instrumentation.setTracerProvider(provider);

    const url = 'amqp://localhost:22221';
    let conn: amqpCallback.Connection;
    before((done) => {
        amqpCallback.connect(url, (err, connection) => {
            conn = connection;
            done();
        });
    });
    after((done) => {
        conn.close(() => done());
        instrumentation.disable();
    });

    let channel: amqpCallback.Channel;
    beforeEach((done) => {
        memoryExporter.reset();
        instrumentation.enable();
        conn.createChannel((err, c) => {
            channel = c;
            // install an error handler, otherwise when we have tests that create error on the channel,
            // it throws and crash process
            channel.on('error', () => {});
            channel.assertQueue(queueName, { durable: false }, (err, ok) => {
                channel.purgeQueue(queueName, (err, ok) => {
                    done();
                });
            });
        });
    });

    afterEach((done) => {
        instrumentation.disable();
        try {
            channel.close((err) => {
                done()
            });
        } catch {}
    });

    it('simple publish and consume from queue callback', (done) => {
        const hadSpaceInBuffer = channel.sendToQueue(queueName, Buffer.from(msgPayload));
        expect(hadSpaceInBuffer).toBeTruthy();

        asyncConsume(channel, queueName, [(msg) => expect(msg.content.toString()).toStrictEqual(msgPayload)], {
            noAck: true,
        }).then(() => {
            const [publishSpan, consumeSpan] = memoryExporter.getFinishedSpans();

            // assert publish span
            expect(publishSpan.kind).toStrictEqual(SpanKind.PRODUCER);
            expect(publishSpan.attributes[MessagingAttribute.MESSAGING_SYSTEM]).toStrictEqual('rabbitmq');
            expect(publishSpan.attributes[MessagingAttribute.MESSAGING_DESTINATION]).toStrictEqual(''); // according to spec: "This will be an empty string if the default exchange is used"
            expect(publishSpan.attributes[MessagingAttribute.MESSAGING_DESTINATION_KIND]).toStrictEqual('topic');
            expect(publishSpan.attributes[MessagingAttribute.MESSAGING_RABBITMQ_ROUTING_KEY]).toStrictEqual(queueName);
            expect(publishSpan.attributes[MessagingAttribute.MESSAGING_PROTOCOL]).toStrictEqual('AMQP');
            expect(publishSpan.attributes[MessagingAttribute.MESSAGING_PROTOCOL_VERSION]).toStrictEqual('0.9.1');
            expect(publishSpan.attributes[MessagingAttribute.MESSAGING_URL]).toStrictEqual(url);
            expect(publishSpan.attributes[GeneralAttribute.NET_PEER_NAME]).toStrictEqual('localhost');
            expect(publishSpan.attributes[GeneralAttribute.NET_PEER_PORT]).toStrictEqual(22221);

            // assert consume span
            expect(consumeSpan.kind).toStrictEqual(SpanKind.CONSUMER);
            expect(consumeSpan.attributes[MessagingAttribute.MESSAGING_SYSTEM]).toStrictEqual('rabbitmq');
            expect(consumeSpan.attributes[MessagingAttribute.MESSAGING_DESTINATION]).toStrictEqual(''); // according to spec: "This will be an empty string if the default exchange is used"
            expect(consumeSpan.attributes[MessagingAttribute.MESSAGING_DESTINATION_KIND]).toStrictEqual('topic');
            expect(consumeSpan.attributes[MessagingAttribute.MESSAGING_RABBITMQ_ROUTING_KEY]).toStrictEqual(queueName);
            expect(consumeSpan.attributes[MessagingAttribute.MESSAGING_PROTOCOL]).toStrictEqual('AMQP');
            expect(consumeSpan.attributes[MessagingAttribute.MESSAGING_PROTOCOL_VERSION]).toStrictEqual('0.9.1');
            expect(consumeSpan.attributes[MessagingAttribute.MESSAGING_URL]).toStrictEqual(url);
            expect(consumeSpan.attributes[GeneralAttribute.NET_PEER_NAME]).toStrictEqual('localhost');
            expect(consumeSpan.attributes[GeneralAttribute.NET_PEER_PORT]).toStrictEqual(22221);

            // assert context propagation
            expect(consumeSpan.spanContext.traceId).toStrictEqual(publishSpan.spanContext.traceId);
            expect(consumeSpan.parentSpanId).toStrictEqual(publishSpan.spanContext.spanId);

            done();
        });
    });

    it('end span with ack sync', done => {
        channel.sendToQueue(queueName, Buffer.from(msgPayload));

        asyncConsume(channel, queueName, [(msg) => channel.ack(msg)]).then( () => {
            // assert consumed message span has ended
            expect(memoryExporter.getFinishedSpans().length).toBe(2);
            done();
        });
    });

    it('end span with ack async', done => {
        channel.sendToQueue(queueName, Buffer.from(msgPayload));

        asyncConsume(channel, queueName, [
            (msg) =>
                setTimeout(() => {
                    channel.ack(msg);
                    expect(memoryExporter.getFinishedSpans().length).toBe(2);
                    done();                            
                }, 1),
        ]);
    });

});

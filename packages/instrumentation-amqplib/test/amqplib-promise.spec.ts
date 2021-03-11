import 'mocha';
import expect from 'expect';
import sinon from 'sinon';
import lodash from 'lodash';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/tracing';
import { NodeTracerProvider } from '@opentelemetry/node';
import { HttpTraceContext } from '@opentelemetry/core';
import { AmqplibInstrumentation, EndOperation, PublishParams } from '../src';

const instrumentation = new AmqplibInstrumentation();
instrumentation.enable();
instrumentation.disable();

import amqp from 'amqplib';
import { GeneralAttribute, MessagingAttribute } from '@opentelemetry/semantic-conventions';
import { propagation, Span, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { asyncConsume } from './utils';

const msgPayload = 'payload from test';
const queueName = 'queue-name-from-unittest';

describe('amqplib instrumentation promise model', function () {
    const provider = new NodeTracerProvider();
    const memoryExporter = new InMemorySpanExporter();
    const spanProcessor = new SimpleSpanProcessor(memoryExporter);
    propagation.setGlobalPropagator(new HttpTraceContext());
    provider.addSpanProcessor(spanProcessor);
    instrumentation.setTracerProvider(provider);

    const url = 'amqp://localhost:22221';
    let conn: amqp.Connection;
    before(async () => {
        instrumentation.enable();
        conn = await amqp.connect(url);
    });
    after(async () => {
        await conn.close();
        instrumentation.disable();
    });

    let endHookSpy;
    const expectConsumeEndSpyStatus = (expectedEndOperations: EndOperation[]): void => {
        expect(endHookSpy.callCount).toBe(expectedEndOperations.length);
        expectedEndOperations.forEach((endOperation: EndOperation, index: number) => {
            expect(endHookSpy.args[index][3]).toStrictEqual(endOperation);
            switch (endOperation) {
                case EndOperation.AutoAck:
                case EndOperation.Ack:
                case EndOperation.AckAll:
                    expect(endHookSpy.args[index][2]).toBeFalsy();
                    break;

                case EndOperation.Reject:
                case EndOperation.Nack:
                case EndOperation.NackAll:
                case EndOperation.ChannelClosed:
                case EndOperation.ChannelError:
                    expect(endHookSpy.args[index][2]).toBeTruthy();
                    break;
            }
        });
    };

    let channel: amqp.Channel;
    beforeEach(async () => {
        memoryExporter.reset();

        // instrumentation.disable();
        endHookSpy = sinon.spy();
        instrumentation.setConfig({
            consumeEndHook: endHookSpy,
        });
        instrumentation.enable();

        channel = await conn.createChannel();
        await channel.assertQueue(queueName, { durable: false });
        await channel.purgeQueue(queueName);
        // install an error handler, otherwise when we have tests that create error on the channel,
        // it throws and crash process
        channel.on('error', () => {});
    });
    afterEach(async () => {
        try {
            channel.close();
        } catch {}
        instrumentation.disable();
    });

    it('simple publish and consume from queue', async () => {
        const hadSpaceInBuffer = channel.sendToQueue(queueName, Buffer.from(msgPayload));
        expect(hadSpaceInBuffer).toBeTruthy();

        await asyncConsume(channel, queueName, [(msg) => expect(msg.content.toString()).toStrictEqual(msgPayload)], {
            noAck: true,
        });
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

        expectConsumeEndSpyStatus([EndOperation.AutoAck]);
    });

    describe('ending consume spans', () => {
        it('message acked sync', async () => {
            channel.sendToQueue(queueName, Buffer.from(msgPayload));

            await asyncConsume(channel, queueName, [(msg) => channel.ack(msg)]);
            // assert consumed message span has ended
            expect(memoryExporter.getFinishedSpans().length).toBe(2);
            expectConsumeEndSpyStatus([EndOperation.Ack]);
        });

        it('message acked async', async () => {
            channel.sendToQueue(queueName, Buffer.from(msgPayload));

            // start async timer and ack the message after the callback returns
            await new Promise<void>((resolve) => {
                asyncConsume(channel, queueName, [
                    (msg) =>
                        setTimeout(() => {
                            channel.ack(msg);
                            resolve();
                        }, 1),
                ]);
            });
            // assert consumed message span has ended
            expect(memoryExporter.getFinishedSpans().length).toBe(2);
            expectConsumeEndSpyStatus([EndOperation.Ack]);
        });

        it('message nack no requeue', async () => {
            channel.sendToQueue(queueName, Buffer.from(msgPayload));

            await asyncConsume(channel, queueName, [(msg) => channel.nack(msg, false, false)]);
            await new Promise((resolve) => setTimeout(resolve, 20)); // just make sure we don't get it again
            // assert consumed message span has ended
            expect(memoryExporter.getFinishedSpans().length).toBe(2);
            const [_, consumerSpan] = memoryExporter.getFinishedSpans();
            expect(consumerSpan.status.code).toStrictEqual(SpanStatusCode.ERROR);
            expect(consumerSpan.status.message).toStrictEqual('nack called on message without requeue');
            expectConsumeEndSpyStatus([EndOperation.Nack]);
        });

        it('message nack requeue, then acked', async () => {
            channel.sendToQueue(queueName, Buffer.from(msgPayload));

            // @ts-ignore
            await asyncConsume(channel, queueName, [
                (msg: amqp.Message) => channel.nack(msg, false, true),
                (msg: amqp.Message) => channel.ack(msg),
            ]);
            // assert we have the requeued message sent again
            expect(memoryExporter.getFinishedSpans().length).toBe(3);
            const [_, rejectedConsumerSpan, successConsumerSpan] = memoryExporter.getFinishedSpans();
            expect(rejectedConsumerSpan.status.code).toStrictEqual(SpanStatusCode.ERROR);
            expect(rejectedConsumerSpan.status.message).toStrictEqual('nack called on message with requeue');
            expect(successConsumerSpan.status.code).toStrictEqual(SpanStatusCode.UNSET);
            expectConsumeEndSpyStatus([EndOperation.Nack, EndOperation.Ack]);
        });

        it('ack allUpTo 2 msgs sync', async () => {
            lodash.times(3, () => channel.sendToQueue(queueName, Buffer.from(msgPayload)));

            // @ts-ignore
            await asyncConsume(channel, queueName, [null, (msg) => channel.ack(msg, true), (msg) => channel.ack(msg)]);
            // assert all 3 messages are acked, including the first one which is acked by allUpTo
            expect(memoryExporter.getFinishedSpans().length).toBe(6);
            expectConsumeEndSpyStatus([EndOperation.Ack, EndOperation.Ack, EndOperation.Ack]);
        });

        it('nack allUpTo 2 msgs sync', async () => {
            lodash.times(3, () => channel.sendToQueue(queueName, Buffer.from(msgPayload)));

            // @ts-ignore
            await asyncConsume(channel, queueName, [
                null,
                (msg) => channel.nack(msg, true),
                (msg) => channel.nack(msg),
            ]);
            // assert all 3 messages are acked, including the first one which is acked by allUpTo
            expect(memoryExporter.getFinishedSpans().length).toBe(6);
            lodash.range(3, 6).forEach((i) => {
                expect(memoryExporter.getFinishedSpans()[i].status.code).toStrictEqual(SpanStatusCode.ERROR);
                expect(memoryExporter.getFinishedSpans()[i].status.message).toStrictEqual(
                    'nack called on message without requeue'
                );
            });
            expectConsumeEndSpyStatus([EndOperation.Nack, EndOperation.Nack, EndOperation.Nack]);
        });

        it('ack not in received order', async () => {
            lodash.times(3, () => channel.sendToQueue(queueName, Buffer.from(msgPayload)));

            // @ts-ignore
            const msgs = await asyncConsume(channel, queueName, [null, null, null]);
            channel.ack(msgs[1]);
            channel.ack(msgs[2]);
            channel.ack(msgs[0]);
            // assert all 3 span messages are ended
            expect(memoryExporter.getFinishedSpans().length).toBe(6);
            expectConsumeEndSpyStatus([EndOperation.Ack, EndOperation.Ack, EndOperation.Ack]);
        });

        it('ackAll', async () => {
            lodash.times(2, () => channel.sendToQueue(queueName, Buffer.from(msgPayload)));

            // @ts-ignore
            await asyncConsume(channel, queueName, [null, () => channel.ackAll()]);
            // assert all 2 span messages are ended by call to ackAll
            expect(memoryExporter.getFinishedSpans().length).toBe(4);
            expectConsumeEndSpyStatus([EndOperation.AckAll, EndOperation.AckAll]);
        });

        it('nackAll', async () => {
            lodash.times(2, () => channel.sendToQueue(queueName, Buffer.from(msgPayload)));

            // @ts-ignore
            await asyncConsume(channel, queueName, [null, () => channel.nackAll()]);
            // assert all 2 span messages are ended by calling nackAll
            expect(memoryExporter.getFinishedSpans().length).toBe(4);
            lodash.range(2, 4).forEach((i) => {
                expect(memoryExporter.getFinishedSpans()[i].status.code).toStrictEqual(SpanStatusCode.ERROR);
                expect(memoryExporter.getFinishedSpans()[i].status.message).toStrictEqual(
                    'nackAll called on message without requeue'
                );
            });
            expectConsumeEndSpyStatus([EndOperation.NackAll, EndOperation.NackAll]);
        });

        it('reject', async () => {
            lodash.times(1, () => channel.sendToQueue(queueName, Buffer.from(msgPayload)));

            // @ts-ignore
            await asyncConsume(channel, queueName, [(msg) => channel.reject(msg, false)]);
            expect(memoryExporter.getFinishedSpans().length).toBe(2);
            expect(memoryExporter.getFinishedSpans()[1].status.code).toStrictEqual(SpanStatusCode.ERROR);
            expect(memoryExporter.getFinishedSpans()[1].status.message).toStrictEqual(
                'reject called on message without requeue'
            );
            expectConsumeEndSpyStatus([EndOperation.Reject]);
        });

        it('reject with requeue', async () => {
            lodash.times(1, () => channel.sendToQueue(queueName, Buffer.from(msgPayload)));

            // @ts-ignore
            await asyncConsume(channel, queueName, [
                (msg) => channel.reject(msg, true),
                (msg) => channel.reject(msg, false),
            ]);
            expect(memoryExporter.getFinishedSpans().length).toBe(3);
            expect(memoryExporter.getFinishedSpans()[1].status.code).toStrictEqual(SpanStatusCode.ERROR);
            expect(memoryExporter.getFinishedSpans()[1].status.message).toStrictEqual(
                'reject called on message with requeue'
            );
            expect(memoryExporter.getFinishedSpans()[2].status.code).toStrictEqual(SpanStatusCode.ERROR);
            expect(memoryExporter.getFinishedSpans()[2].status.message).toStrictEqual(
                'reject called on message without requeue'
            );
            expectConsumeEndSpyStatus([EndOperation.Reject, EndOperation.Reject]);
        });

        it('closing channel should end all open spans on it', async () => {
            lodash.times(1, () => channel.sendToQueue(queueName, Buffer.from(msgPayload)));

            await new Promise<void>((resolve) =>
                asyncConsume(channel, queueName, [
                    async (msg) => {
                        await channel.close();
                        resolve();
                    },
                ])
            );

            expect(memoryExporter.getFinishedSpans().length).toBe(2);
            expect(memoryExporter.getFinishedSpans()[1].status.code).toStrictEqual(SpanStatusCode.ERROR);
            expect(memoryExporter.getFinishedSpans()[1].status.message).toStrictEqual('channel closed');
            expectConsumeEndSpyStatus([EndOperation.ChannelClosed]);
        });

        it('error on channel should end all open spans on it', (done) => {
            lodash.times(2, () => channel.sendToQueue(queueName, Buffer.from(msgPayload)));

            channel.on('close', () => {
                expect(memoryExporter.getFinishedSpans().length).toBe(4);
                // second consume ended with valid ack, previous message not acked when channel is errored.
                // since we first ack the second message, it appear first in the finished spans array
                expect(memoryExporter.getFinishedSpans()[2].status.code).toStrictEqual(SpanStatusCode.UNSET);
                expect(memoryExporter.getFinishedSpans()[3].status.code).toStrictEqual(SpanStatusCode.ERROR);
                expect(memoryExporter.getFinishedSpans()[3].status.message).toStrictEqual('channel error');
                expectConsumeEndSpyStatus([EndOperation.Ack, EndOperation.ChannelError]);
                done();
            });
            asyncConsume(channel, queueName, [
                null,
                (msg) => {
                    try {
                        channel.ack(msg);
                        // ack the same msg again, this is not valid and should close the channel
                        channel.ack(msg);
                    } catch {}
                },
            ]);
        });

        // what should we do in this case?
        // can cause memory leak since the plugin saves a copy of the msg
        it.skip('throw exception from consumer callback', async () => {
            lodash.times(1, () => channel.sendToQueue(queueName, Buffer.from(msgPayload)));

            try {
                await asyncConsume(channel, queueName, [
                    (msg) => {
                        throw Error('error from unit test');
                    },
                ]);
            } catch (err) {
                // console.log(err);
            }

            expect(memoryExporter.getFinishedSpans().length).toBe(2);
        });
    });

    describe('routing and exchange', () => {
        it('topic exchange', async () => {
            const exchangeName = 'topic exchange';
            const routingKey = 'topic.name.from.unittest';
            await channel.assertExchange(exchangeName, 'topic', { durable: false });

            const { queue: queueName } = await channel.assertQueue('', { durable: false });
            await channel.bindQueue(queueName, exchangeName, '#');

            const consumerPromise = asyncConsume(channel, queueName, [null], {
                noAck: true,
            });

            channel.publish(exchangeName, routingKey, Buffer.from(msgPayload));
            await consumerPromise;

            const [publishSpan, consumeSpan] = memoryExporter.getFinishedSpans();

            // assert publish span
            expect(publishSpan.kind).toStrictEqual(SpanKind.PRODUCER);
            expect(publishSpan.attributes[MessagingAttribute.MESSAGING_SYSTEM]).toStrictEqual('rabbitmq');
            expect(publishSpan.attributes[MessagingAttribute.MESSAGING_DESTINATION]).toStrictEqual(exchangeName);
            expect(publishSpan.attributes[MessagingAttribute.MESSAGING_DESTINATION_KIND]).toStrictEqual('topic');
            expect(publishSpan.attributes[MessagingAttribute.MESSAGING_RABBITMQ_ROUTING_KEY]).toStrictEqual(routingKey);
            expect(publishSpan.attributes[MessagingAttribute.MESSAGING_PROTOCOL]).toStrictEqual('AMQP');
            expect(publishSpan.attributes[MessagingAttribute.MESSAGING_PROTOCOL_VERSION]).toStrictEqual('0.9.1');

            // assert consume span
            expect(consumeSpan.kind).toStrictEqual(SpanKind.CONSUMER);
            expect(consumeSpan.attributes[MessagingAttribute.MESSAGING_SYSTEM]).toStrictEqual('rabbitmq');
            expect(consumeSpan.attributes[MessagingAttribute.MESSAGING_DESTINATION]).toStrictEqual(exchangeName);
            expect(consumeSpan.attributes[MessagingAttribute.MESSAGING_DESTINATION_KIND]).toStrictEqual('topic');
            expect(consumeSpan.attributes[MessagingAttribute.MESSAGING_RABBITMQ_ROUTING_KEY]).toStrictEqual(routingKey);
            expect(consumeSpan.attributes[MessagingAttribute.MESSAGING_PROTOCOL]).toStrictEqual('AMQP');
            expect(consumeSpan.attributes[MessagingAttribute.MESSAGING_PROTOCOL_VERSION]).toStrictEqual('0.9.1');

            // assert context propagation
            expect(consumeSpan.spanContext.traceId).toStrictEqual(publishSpan.spanContext.traceId);
            expect(consumeSpan.parentSpanId).toStrictEqual(publishSpan.spanContext.spanId);
        });
    });

    it('moduleVersionAttributeName works with publish and consume', async () => {
        const VERSION_ATTR = 'module.version';
        instrumentation.disable();
        instrumentation.setConfig({
            moduleVersionAttributeName: VERSION_ATTR,
        });
        instrumentation.enable();

        channel.sendToQueue(queueName, Buffer.from(msgPayload));

        await asyncConsume(channel, queueName, [(msg) => expect(msg.content.toString()).toStrictEqual(msgPayload)], {
            noAck: true,
        });
        expect(memoryExporter.getFinishedSpans().length).toBe(2);
        memoryExporter
            .getFinishedSpans()
            .forEach((s) => expect(s.attributes[VERSION_ATTR]).toMatch(/\d{1,4}\.\d{1,4}\.\d{1,5}.*/));
    });

    describe('hooks', () => {
        it('publish and consume hooks success', async () => {
            const attributeNameFromHook = 'attribute.name.from.hook';
            const hookAttributeValue = 'attribute value from hook';
            const attributeNameFromEndHook = 'attribute.name.from.endhook';
            const endHookAttributeValue = 'attribute value from end hook';
            instrumentation.disable();
            instrumentation.setConfig({
                publishHook: (span: Span, publishParams: PublishParams): void => {
                    span.setAttribute(attributeNameFromHook, hookAttributeValue);
                    expect(publishParams.exchange).toStrictEqual('');
                    expect(publishParams.routingKey).toStrictEqual(queueName);
                    expect(publishParams.content.toString()).toStrictEqual(msgPayload);
                },
                consumeHook: (span: Span, msg: amqp.ConsumeMessage | null): void => {
                    span.setAttribute(attributeNameFromHook, hookAttributeValue);
                    expect(msg.content.toString()).toStrictEqual(msgPayload);
                },
                consumeEndHook: (
                    span: Span,
                    msg: amqp.ConsumeMessage | null,
                    rejected: boolean,
                    endOperation: EndOperation
                ): void => {
                    span.setAttribute(attributeNameFromEndHook, endHookAttributeValue);
                    expect(endOperation).toStrictEqual(EndOperation.AutoAck);
                },
            });
            instrumentation.enable();

            channel.sendToQueue(queueName, Buffer.from(msgPayload));

            await asyncConsume(channel, queueName, [null], {
                noAck: true,
            });
            expect(memoryExporter.getFinishedSpans().length).toBe(2);
            expect(memoryExporter.getFinishedSpans()[0].attributes[attributeNameFromHook]).toStrictEqual(
                hookAttributeValue
            );
            expect(memoryExporter.getFinishedSpans()[1].attributes[attributeNameFromHook]).toStrictEqual(
                hookAttributeValue
            );
            expect(memoryExporter.getFinishedSpans()[1].attributes[attributeNameFromEndHook]).toStrictEqual(
                endHookAttributeValue
            );
        });

        it('hooks throw should not affect user flow or span creation', async () => {
            const attributeNameFromHook = 'attribute.name.from.hook';
            const hookAttributeValue = 'attribute value from hook';
            instrumentation.disable();
            instrumentation.setConfig({
                publishHook: (span: Span, publishParams: PublishParams): void => {
                    span.setAttribute(attributeNameFromHook, hookAttributeValue);
                    throw new Error('error from hook');
                },
                consumeHook: (span: Span, msg: amqp.ConsumeMessage | null): void => {
                    span.setAttribute(attributeNameFromHook, hookAttributeValue);
                    throw new Error('error from hook');
                },
            });
            instrumentation.enable();

            channel.sendToQueue(queueName, Buffer.from(msgPayload));

            await asyncConsume(channel, queueName, [null], {
                noAck: true,
            });
            expect(memoryExporter.getFinishedSpans().length).toBe(2);
            memoryExporter
                .getFinishedSpans()
                .forEach((s) => expect(s.attributes[attributeNameFromHook]).toStrictEqual(hookAttributeValue));
        });
    });

    describe('connection properties', () => {
        it('connect by url object', async () => {
            const objConnection = await amqp.connect({ port: 22221 });
            const channel = await objConnection.createChannel();
            channel.sendToQueue(queueName, Buffer.from(msgPayload));
            await asyncConsume(channel, queueName, [null], {
                noAck: true,
            });

            objConnection.close();

            expect(memoryExporter.getFinishedSpans().length).toBe(2);
            memoryExporter.getFinishedSpans().forEach((s) => {
                expect(s.attributes[GeneralAttribute.NET_PEER_NAME]).toStrictEqual('localhost');
                expect(s.attributes[GeneralAttribute.NET_PEER_PORT]).toStrictEqual(22221);
            });
        });

        it('invalid connection url', async () => {
            try {
                await amqp.connect('foobar://the.protocol.is.not.valid');
            } catch (err) {
                // make sure we are not throwing from instrumentation when invalid url is used
                expect(err.message).toStrictEqual('Expected amqp: or amqps: as the protocol; got foobar:');
            }
        });
    });
});
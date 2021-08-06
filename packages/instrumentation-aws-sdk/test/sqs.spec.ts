import 'mocha';
import { AwsInstrumentation } from '../src';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { context, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { ReadableSpan, Span } from '@opentelemetry/tracing';
import { mockAwsSend } from './testing-utils';
import { Message } from 'aws-sdk/clients/sqs';
import expect from 'expect';
import { getTestSpans } from 'opentelemetry-instrumentation-testing-utils';

const instrumentation = new AwsInstrumentation();
instrumentation.enable();
import AWS, { AWSError } from 'aws-sdk';
instrumentation.disable();

const responseMockSuccess = {
    requestId: '0000000000000',
    error: null,
};

describe('SQS', () => {
    before(() => {
        AWS.config.credentials = {
            accessKeyId: 'test key id',
            expired: false,
            expireTime: null,
            secretAccessKey: 'test acc key',
            sessionToken: 'test token',
        };
    });

    beforeEach(() => {
        mockAwsSend(responseMockSuccess, {
            Messages: [{ Body: 'msg 1 payload' }, { Body: 'msg 2 payload' }],
        } as AWS.SQS.Types.ReceiveMessageResult);
    });

    afterEach(() => {
        instrumentation.disable();
    });

    describe('receive context', () => {
        beforeEach(() => {
            instrumentation.disable();
            instrumentation.enable();
        });

        const createReceiveChildSpan = () => {
            const childSpan = trace
                .getTracerProvider()
                .getTracer('default')
                .startSpan('child span of SQS.ReceiveMessage');
            childSpan.end();
        };

        const expectReceiverWithChildSpan = (spans: ReadableSpan[]) => {
            const awsReceiveSpan = spans.filter((s) => s.kind === SpanKind.CONSUMER);
            expect(awsReceiveSpan.length).toBe(1);
            const internalSpan = spans.filter((s) => s.kind === SpanKind.INTERNAL);
            expect(internalSpan.length).toBe(1);
            expect(internalSpan[0].parentSpanId).toStrictEqual(awsReceiveSpan[0].spanContext().spanId);
        };

        it('should set parent context in sqs receive callback', (done) => {
            const sqs = new AWS.SQS();
            sqs.receiveMessage(
                {
                    QueueUrl: 'queue/url/for/unittests',
                },
                (err: AWSError, data: AWS.SQS.Types.ReceiveMessageResult) => {
                    expect(err).toBeFalsy();
                    createReceiveChildSpan();
                    expectReceiverWithChildSpan(getTestSpans());
                    done();
                }
            );
        });

        it("should set parent context in sqs receive 'send' callback", (done) => {
            const sqs = new AWS.SQS();
            sqs.receiveMessage({
                QueueUrl: 'queue/url/for/unittests',
            }).send((err: AWSError, data: AWS.SQS.Types.ReceiveMessageResult) => {
                expect(err).toBeFalsy();
                createReceiveChildSpan();
                expectReceiverWithChildSpan(getTestSpans());
                done();
            });
        });

        it('should set parent context in sqs receive promise then', async () => {
            const sqs = new AWS.SQS();
            const res = await sqs
                .receiveMessage({
                    QueueUrl: 'queue/url/for/unittests',
                })
                .promise()
                .then(() => {
                    createReceiveChildSpan();
                    expectReceiverWithChildSpan(getTestSpans());
                });
        });

        it.skip('should set parent context in sqs receive after await', async () => {
            const sqs = new AWS.SQS();
            await sqs
                .receiveMessage({
                    QueueUrl: 'queue/url/for/unittests',
                })
                .promise();

            createReceiveChildSpan();
            expectReceiverWithChildSpan(getTestSpans());
        });

        it.skip('should set parent context in sqs receive from async function', async () => {
            const asycnReceive = async () => {
                try {
                    const sqs = new AWS.SQS();
                    return await sqs
                        .receiveMessage({
                            QueueUrl: 'queue/url/for/unittests',
                        })
                        .promise();
                } catch (err) {}
            };

            const res = await asycnReceive();
            createReceiveChildSpan();
            expectReceiverWithChildSpan(getTestSpans());
        });
    });

    describe('process spans', () => {
        beforeEach(() => {
            instrumentation.disable();
            instrumentation.enable();
        });

        let receivedMessages: Message[];

        const createProcessChildSpan = (msgContext: any) => {
            const processChildSpan = trace
                .getTracerProvider()
                .getTracer('default')
                .startSpan(`child span of sqs processing span of msg ${msgContext}`);
            processChildSpan.end();
        };

        const expectReceiver2ProcessWithNChildrenEach = (spans: ReadableSpan[], numChildPerProcessSpan: number) => {
            const awsReceiveSpan = spans.filter(
                (s) => s.attributes[SemanticAttributes.MESSAGING_OPERATION] === 'receive'
            );
            expect(awsReceiveSpan.length).toBe(1);

            const processSpans = spans.filter(
                (s) => s.attributes[SemanticAttributes.MESSAGING_OPERATION] === 'process'
            );
            expect(processSpans.length).toBe(2);
            expect(processSpans[0].parentSpanId).toStrictEqual(awsReceiveSpan[0].spanContext().spanId);
            expect(processSpans[1].parentSpanId).toStrictEqual(awsReceiveSpan[0].spanContext().spanId);

            const processChildSpans = spans.filter((s) => s.kind === SpanKind.INTERNAL);
            expect(processChildSpans.length).toBe(2 * numChildPerProcessSpan);
            for (let i = 0; i < numChildPerProcessSpan; i++) {
                expect(processChildSpans[2 * i + 0].parentSpanId).toStrictEqual(processSpans[0].spanContext().spanId);
                expect(processChildSpans[2 * i + 1].parentSpanId).toStrictEqual(processSpans[1].spanContext().spanId);
            }
        };

        const expectReceiver2ProcessWith1ChildEach = (spans: ReadableSpan[]) => {
            expectReceiver2ProcessWithNChildrenEach(spans, 1);
        };

        const expectReceiver2ProcessWith2ChildEach = (spans: ReadableSpan[]) => {
            expectReceiver2ProcessWithNChildrenEach(spans, 2);
        };

        const contextKeyFromTest = Symbol('context key from test');
        const contextValueFromTest = 'context value from test';

        beforeEach(async () => {
            const sqs = new AWS.SQS();
            await context.with(context.active().setValue(contextKeyFromTest, contextValueFromTest), async () => {
                const res = await sqs
                    .receiveMessage({
                        QueueUrl: 'queue/url/for/unittests',
                    })
                    .promise();
                receivedMessages = res.Messages;
            });
        });

        it('should create processing child with forEach', async () => {
            receivedMessages.forEach((msg) => {
                createProcessChildSpan(msg.Body);
            });
            expectReceiver2ProcessWith1ChildEach(getTestSpans());
        });

        it('should create processing child with map', async () => {
            receivedMessages.map((msg) => {
                createProcessChildSpan(msg.Body);
            });
            expectReceiver2ProcessWith1ChildEach(getTestSpans());
        });

        it('should not fail when mapping to non-object type', async () => {
            receivedMessages.map((msg) => 'map result is string').map((s) => 'some other string');
        });

        it('should not fail when mapping to undefined type', async () => {
            receivedMessages.map((msg) => undefined).map((s) => 'some other string');
        });

        it('should create one processing child when throws in map', async () => {
            try {
                receivedMessages.map((msg) => {
                    createProcessChildSpan(msg.Body);
                    throw Error('error from array.map');
                });
            } catch (err) {}

            const processChildSpans = getTestSpans().filter((s) => s.kind === SpanKind.INTERNAL);
            expect(processChildSpans.length).toBe(1);
        });

        it('should create processing child with two forEach', async () => {
            receivedMessages.forEach((msg) => {
                createProcessChildSpan(msg.Body);
            });
            receivedMessages.forEach((msg) => {
                createProcessChildSpan(msg.Body);
            });
            expectReceiver2ProcessWith2ChildEach(getTestSpans());
        });

        it('should forward all parameters to forEach callback', async () => {
            const objectForThis = {};
            receivedMessages.forEach(function (msg, index, array) {
                expect(msg).not.toBeUndefined();
                expect(index).toBeLessThan(2);
                expect(index).toBeGreaterThanOrEqual(0);
                expect(array).toBe(receivedMessages);
                expect(this).toBe(objectForThis);
            }, objectForThis);
        });

        it('should create one processing child with forEach that throws', async () => {
            try {
                receivedMessages.forEach((msg) => {
                    createProcessChildSpan(msg.Body);
                    throw Error('error from forEach');
                });
            } catch (err) {}
            const processChildSpans = getTestSpans().filter((s) => s.kind === SpanKind.INTERNAL);
            expect(processChildSpans.length).toBe(1);
        });

        it.skip('should create processing child with array index access', async () => {
            for (let i = 0; i < receivedMessages.length; i++) {
                const msg = receivedMessages[i];
                createProcessChildSpan(msg.Body);
            }
            expectReceiver2ProcessWith1ChildEach(getTestSpans());
        });

        it('should create processing child with map and forEach calls', async () => {
            receivedMessages
                .map((msg) => ({ payload: msg.Body }))
                .forEach((msgBody) => {
                    createProcessChildSpan(msgBody);
                });
            expectReceiver2ProcessWith1ChildEach(getTestSpans());
        });

        it('should create processing child with filter and forEach', async () => {
            receivedMessages
                .filter((msg) => msg)
                .forEach((msgBody) => {
                    createProcessChildSpan(msgBody);
                });
            expectReceiver2ProcessWith1ChildEach(getTestSpans());
        });

        it.skip('should create processing child with for(msg of messages)', () => {
            for (const msg of receivedMessages) {
                createProcessChildSpan(msg.Body);
            }
            expectReceiver2ProcessWith1ChildEach(getTestSpans());
        });

        it.skip('should create processing child with array.values() for loop', () => {
            for (const msg of receivedMessages.values()) {
                createProcessChildSpan(msg.Body);
            }
            expectReceiver2ProcessWith1ChildEach(getTestSpans());
        });

        it.skip('should create processing child with array.values() for loop and awaits in process', async () => {
            for (const msg of receivedMessages.values()) {
                await new Promise((resolve) => setImmediate(resolve));
                createProcessChildSpan(msg.Body);
            }
            expectReceiver2ProcessWith1ChildEach(getTestSpans());
        });

        it('should propagate the context of the receive call in process spans loop', async () => {
            receivedMessages.forEach(() => {
                expect(context.active().getValue(contextKeyFromTest)).toStrictEqual(contextValueFromTest);
            });
        });
    });

    describe('hooks', () => {
        it('sqsProcessHook called and add message attribute to span', async () => {
            const config = {
                sqsProcessHook: (span: Span, message: AWS.SQS.Message) => {
                    span.setAttribute('attribute from sqs process hook', message.Body);
                },
            };

            instrumentation.disable();
            instrumentation.setConfig(config);
            instrumentation.enable();

            const sqs = new AWS.SQS();
            const res = await sqs
                .receiveMessage({
                    QueueUrl: 'queue/url/for/unittests',
                })
                .promise();
            res.Messages.map((message) => 'some mapping to create child process spans');

            const processSpans = getTestSpans().filter(
                (s) => s.attributes[SemanticAttributes.MESSAGING_OPERATION] === 'process'
            );
            expect(processSpans.length).toBe(2);
            expect(processSpans[0].attributes['attribute from sqs process hook']).toBe('msg 1 payload');
            expect(processSpans[1].attributes['attribute from sqs process hook']).toBe('msg 2 payload');
        });

        it('sqsProcessHook not set in config', async () => {
            instrumentation.disable();
            instrumentation.enable();

            const sqs = new AWS.SQS();
            const res = await sqs
                .receiveMessage({
                    QueueUrl: 'queue/url/for/unittests',
                })
                .promise();
            res.Messages.map((message) => 'some mapping to create child process spans');
            const processSpans = getTestSpans().filter(
                (s) => s.attributes[SemanticAttributes.MESSAGING_OPERATION] === 'process'
            );
            expect(processSpans.length).toBe(2);
        });

        it('sqsProcessHook throws does not fail span', async () => {
            const config = {
                sqsProcessHook: (span: Span, message: AWS.SQS.Message) => {
                    throw new Error('error from sqsProcessHook hook');
                },
            };
            instrumentation.disable();
            instrumentation.setConfig(config);
            instrumentation.enable();

            const sqs = new AWS.SQS();
            const res = await sqs
                .receiveMessage({
                    QueueUrl: 'queue/url/for/unittests',
                })
                .promise();
            res.Messages.map((message) => 'some mapping to create child process spans');

            const processSpans = getTestSpans().filter(
                (s) => s.attributes[SemanticAttributes.MESSAGING_OPERATION] === 'process'
            );
            expect(processSpans.length).toBe(2);
            expect(processSpans[0].status.code).toStrictEqual(SpanStatusCode.UNSET);
            expect(processSpans[1].status.code).toStrictEqual(SpanStatusCode.UNSET);
        });
    });
});

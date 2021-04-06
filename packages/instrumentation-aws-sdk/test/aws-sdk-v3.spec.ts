import 'mocha';
import { AwsInstrumentation, NormalizedRequest, NormalizedResponse } from '../src';
import { InMemorySpanExporter, ReadableSpan, SimpleSpanProcessor, Span } from '@opentelemetry/tracing';
import { context, SpanStatusCode, ContextManager, getSpan } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/node';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import { MessagingAttribute, MessagingOperationName, RpcAttribute } from '@opentelemetry/semantic-conventions';
import { AttributeNames } from '../src/enums';
import expect from 'expect';
import * as fs from 'fs';

const region = 'us-east-1';

const instrumentation = new AwsInstrumentation();
instrumentation.disable();
instrumentation.enable();
import { PutObjectCommand, PutObjectCommandOutput, S3, S3Client } from '@aws-sdk/client-s3';
import { SQS } from '@aws-sdk/client-sqs';
import nock from 'nock';

describe('instrumentation-aws-sdk-v3', () => {
    const provider = new NodeTracerProvider();
    const memoryExporter = new InMemorySpanExporter();
    const spanProcessor = new SimpleSpanProcessor(memoryExporter);
    provider.addSpanProcessor(spanProcessor);
    instrumentation.setTracerProvider(provider);
    let contextManager: ContextManager;

    const s3Client = new S3({ region });

    beforeEach(() => {
        contextManager = new AsyncHooksContextManager();
        context.setGlobalContextManager(contextManager.enable());
        instrumentation.enable();
    });

    afterEach(() => {
        memoryExporter.reset();
        contextManager.disable();
        instrumentation.disable();
    });

    describe('functional', () => {
        it('promise await', async () => {
            nock(`https://ot-demo-test.s3.${region}.amazonaws.com/`)
                .put('/aws-ot-s3-test-object.txt?x-id=PutObject')
                .reply(200, fs.readFileSync('./test/mock-responses/s3-put-object.xml', 'utf8'));

            const params = { Bucket: 'ot-demo-test', Key: 'aws-ot-s3-test-object.txt' };
            const awsRes = await s3Client.putObject(params);
            expect(memoryExporter.getFinishedSpans().length).toBe(1);
            const [span] = memoryExporter.getFinishedSpans();
            expect(span.attributes[RpcAttribute.RPC_SYSTEM]).toEqual('aws-api');
            expect(span.attributes[RpcAttribute.RPC_METHOD]).toEqual('putObject');
            expect(span.attributes[RpcAttribute.RPC_SERVICE]).toEqual('s3');
            expect(span.attributes[AttributeNames.AWS_REGION]).toEqual(region);
            expect(span.name).toEqual('s3.putObject');
        });

        it('callback interface', (done) => {
            nock(`https://ot-demo-test.s3.${region}.amazonaws.com/`)
                .put('/aws-ot-s3-test-object.txt?x-id=PutObject')
                .reply(200, fs.readFileSync('./test/mock-responses/s3-put-object.xml', 'utf8'));

            const params = { Bucket: 'ot-demo-test', Key: 'aws-ot-s3-test-object.txt' };
            s3Client.putObject(params, (err: any, data?: PutObjectCommandOutput) => {
                expect(memoryExporter.getFinishedSpans().length).toBe(1);
                const [span] = memoryExporter.getFinishedSpans();
                expect(span.attributes[RpcAttribute.RPC_SYSTEM]).toEqual('aws-api');
                expect(span.attributes[RpcAttribute.RPC_METHOD]).toEqual('putObject');
                expect(span.attributes[RpcAttribute.RPC_SERVICE]).toEqual('s3');
                expect(span.attributes[AttributeNames.AWS_REGION]).toEqual(region);
                expect(span.name).toEqual('s3.putObject');
                done();
            });
        });

        it('use the sdk client style to perform operation', async () => {
            nock(`https://ot-demo-test.s3.${region}.amazonaws.com/`)
                .put('/aws-ot-s3-test-object.txt?x-id=PutObject')
                .reply(200, fs.readFileSync('./test/mock-responses/s3-put-object.xml', 'utf8'));

            const params = { Bucket: 'ot-demo-test', Key: 'aws-ot-s3-test-object.txt' };
            const client = new S3Client({ region });
            await client.send(new PutObjectCommand(params));
            expect(memoryExporter.getFinishedSpans().length).toBe(1);
            const [span] = memoryExporter.getFinishedSpans();
            expect(span.attributes[RpcAttribute.RPC_SYSTEM]).toEqual('aws-api');
            expect(span.attributes[RpcAttribute.RPC_METHOD]).toEqual('putObject');
            expect(span.attributes[RpcAttribute.RPC_SERVICE]).toEqual('s3');
            expect(span.attributes[AttributeNames.AWS_REGION]).toEqual(region);
            expect(span.name).toEqual('s3.putObject');
        });

        it('aws error', async () => {
            nock(`https://invalid-bucket-name.s3.${region}.amazonaws.com/`)
                .put('/aws-ot-s3-test-object.txt?x-id=PutObject')
                .reply(403, fs.readFileSync('./test/mock-responses/invalid-bucket.xml', 'utf8'));

            const params = { Bucket: 'invalid-bucket-name', Key: 'aws-ot-s3-test-object.txt' };

            try {
                await s3Client.putObject(params);
            } catch {
                expect(memoryExporter.getFinishedSpans().length).toBe(1);
                const [span] = memoryExporter.getFinishedSpans();

                // expect error attributes
                expect(span.status.code).toEqual(SpanStatusCode.ERROR);
                expect(span.status.message).toEqual('Access Denied');
                expect(span.events.length).toBe(1);
                expect(span.events[0].name).toEqual('exception');

                expect(span.attributes[RpcAttribute.RPC_SYSTEM]).toEqual('aws-api');
                expect(span.attributes[RpcAttribute.RPC_METHOD]).toEqual('putObject');
                expect(span.attributes[RpcAttribute.RPC_SERVICE]).toEqual('s3');
                expect(span.attributes[AttributeNames.AWS_REGION]).toEqual(region);
                expect(span.attributes[AttributeNames.AWS_REQUEST_ID]).toEqual('MS95GTS7KXQ34X2S');
                expect(span.name).toEqual('s3.putObject');
            }
        });
    });

    describe('instrumentation config', () => {
        describe('hooks', () => {
            it('verify request and response hooks are called with right params', async () => {
                instrumentation.disable();
                instrumentation.setConfig({
                    preRequestHook: (span: Span, request: NormalizedRequest) => {
                        span.setAttribute('attribute.from.request.hook', request.commandInput.Bucket);
                    },

                    responseHook: (span: Span, response: NormalizedResponse) => {
                        span.setAttribute('attribute.from.response.hook', 'data from response hook');
                    },

                    suppressInternalInstrumentation: true,
                });
                instrumentation.enable();

                nock(`https://ot-demo-test.s3.${region}.amazonaws.com/`)
                    .put('/aws-ot-s3-test-object.txt?x-id=PutObject')
                    .reply(200, fs.readFileSync('./test/mock-responses/s3-put-object.xml', 'utf8'));

                const params = { Bucket: 'ot-demo-test', Key: 'aws-ot-s3-test-object.txt' };
                const awsRes = await s3Client.putObject(params);
                expect(memoryExporter.getFinishedSpans().length).toBe(1);
                const [span] = memoryExporter.getFinishedSpans();
                expect(span.attributes['attribute.from.request.hook']).toEqual(params.Bucket);
                expect(span.attributes['attribute.from.response.hook']).toEqual('data from response hook');
            });

            it('handle throw in request and response hooks', async () => {
                instrumentation.disable();
                instrumentation.setConfig({
                    preRequestHook: (span: Span, request: NormalizedRequest) => {
                        span.setAttribute('attribute.from.request.hook', request.commandInput.Bucket);
                        throw new Error('error from request hook in unittests');
                    },

                    responseHook: (span: Span, response: NormalizedResponse) => {
                        throw new Error('error from response hook in unittests');
                    },

                    suppressInternalInstrumentation: true,
                });
                instrumentation.enable();

                nock(`https://ot-demo-test.s3.${region}.amazonaws.com/`)
                    .put('/aws-ot-s3-test-object.txt?x-id=PutObject')
                    .reply(200, fs.readFileSync('./test/mock-responses/s3-put-object.xml', 'utf8'));

                const params = { Bucket: 'ot-demo-test', Key: 'aws-ot-s3-test-object.txt' };
                const awsRes = await s3Client.putObject(params);
                expect(memoryExporter.getFinishedSpans().length).toBe(1);
                const [span] = memoryExporter.getFinishedSpans();
                expect(span.attributes['attribute.from.request.hook']).toEqual(params.Bucket);
            });
        });

        describe('moduleVersionAttributeName', () => {
            it('setting moduleVersionAttributeName is adding module version', async () => {
                instrumentation.disable();
                instrumentation.setConfig({
                    moduleVersionAttributeName: 'module.version',
                    suppressInternalInstrumentation: true,
                });
                instrumentation.enable();

                nock(`https://ot-demo-test.s3.${region}.amazonaws.com/`)
                    .put('/aws-ot-s3-test-object.txt?x-id=PutObject')
                    .reply(200, fs.readFileSync('./test/mock-responses/s3-put-object.xml', 'utf8'));

                const params = { Bucket: 'ot-demo-test', Key: 'aws-ot-s3-test-object.txt' };
                const awsRes = await s3Client.putObject(params);
                expect(memoryExporter.getFinishedSpans().length).toBe(1);
                const [span] = memoryExporter.getFinishedSpans();

                expect(span.attributes['module.version']).toMatch(/3.\d{1,4}\.\d{1,5}.*/);
            });
        });
    });

    describe('custom service behavior', () => {
        describe('sqs', () => {
            const sqsClient = new SQS({ region });

            it('sqs send add messaging attributes', async () => {
                nock(`https://sqs.${region}.amazonaws.com/`)
                    .post('/')
                    .reply(200, fs.readFileSync('./test/mock-responses/sqs-send.xml', 'utf8'));

                const params = {
                    QueueUrl: 'https://sqs.us-east-1.amazonaws.com/731241200085/otel-demo-aws-sdk',
                    MessageBody: 'payload example from v3 without batch',
                };
                const awsRes = await sqsClient.sendMessage(params);
                expect(memoryExporter.getFinishedSpans().length).toBe(1);
                const [span] = memoryExporter.getFinishedSpans();

                // make sure we have the general aws attributes:
                expect(span.attributes[RpcAttribute.RPC_SYSTEM]).toEqual('aws-api');
                expect(span.attributes[RpcAttribute.RPC_METHOD]).toEqual('sendMessage');
                expect(span.attributes[RpcAttribute.RPC_SERVICE]).toEqual('sqs');
                expect(span.attributes[AttributeNames.AWS_REGION]).toEqual(region);

                // custom messaging attributes
                expect(span.attributes[MessagingAttribute.MESSAGING_SYSTEM]).toEqual('aws.sqs');
                expect(span.attributes[MessagingAttribute.MESSAGING_DESTINATION_KIND]).toEqual('queue');
                expect(span.attributes[MessagingAttribute.MESSAGING_DESTINATION]).toEqual('otel-demo-aws-sdk');
                expect(span.attributes[MessagingAttribute.MESSAGING_URL]).toEqual(params.QueueUrl);
            });

            it('sqs receive add messaging attributes and context', (done) => {
                nock(`https://sqs.${region}.amazonaws.com/`)
                    .post('/')
                    .reply(200, fs.readFileSync('./test/mock-responses/sqs-receive.xml', 'utf8'));

                const params = {
                    QueueUrl: 'https://sqs.us-east-1.amazonaws.com/731241200085/otel-demo-aws-sdk',
                    MaxNumberOfMessages: 3,
                };
                sqsClient.receiveMessage(params).then(res => {
                    expect(memoryExporter.getFinishedSpans().length).toBe(1);
                    const [span] = memoryExporter.getFinishedSpans();
    
                    // make sure we have the general aws attributes:
                    expect(span.attributes[RpcAttribute.RPC_SYSTEM]).toEqual('aws-api');
                    expect(span.attributes[RpcAttribute.RPC_METHOD]).toEqual('receiveMessage');
                    expect(span.attributes[RpcAttribute.RPC_SERVICE]).toEqual('sqs');
                    expect(span.attributes[AttributeNames.AWS_REGION]).toEqual(region);
    
                    const receiveCallbackSpan = getSpan(context.active());
                    expect(receiveCallbackSpan).toBeDefined();   
                    const attributes = (receiveCallbackSpan as unknown as ReadableSpan).attributes;
                    expect(attributes[MessagingAttribute.MESSAGING_OPERATION]).toMatch(MessagingOperationName.RECEIVE);
                    done();
                });
            });
        });
    });
});

import 'mocha';
import { AwsInstrumentation } from '../src';
import { InMemorySpanExporter, SimpleSpanProcessor, ReadableSpan, Span } from '@opentelemetry/tracing';
import { context, SpanStatusCode } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/node';
import { ContextManager } from '@opentelemetry/context-base';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import { AttributeNames } from '../src/enums';
import { mockAwsSend } from './testing-utils';
import expect from 'expect';

const instrumentation = new AwsInstrumentation();
import AWS from 'aws-sdk';

describe('instrumentation-aws-sdk', () => {
    const provider = new NodeTracerProvider();
    const memoryExporter = new InMemorySpanExporter();
    const spanProcessor = new SimpleSpanProcessor(memoryExporter);
    provider.addSpanProcessor(spanProcessor);
    instrumentation.setTracerProvider(provider);
    let contextManager: ContextManager;

    const responseMockSuccess = {
        requestId: '0000000000000',
        error: null,
    };

    const responseMockWithError = {
        requestId: '0000000000000',
        error: 'something went wrong',
    };

    const getAwsSpans = (): ReadableSpan[] => {
        return memoryExporter.getFinishedSpans().filter((s) => s.attributes[AttributeNames.COMPONENT] === 'aws-sdk');
    };

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
        contextManager = new AsyncHooksContextManager();
        context.setGlobalContextManager(contextManager.enable());
    });

    afterEach(() => {
        memoryExporter.reset();
        contextManager.disable();
    });

    describe('functional', () => {
        describe('successful send', () => {
            before(() => {
                mockAwsSend(responseMockSuccess);
                instrumentation.disable();
                instrumentation.enable();
            });

            it('adds proper number of spans with correct attributes', async () => {
                const s3 = new AWS.S3();
                const bucketName = 'aws-test-bucket';
                const keyName = 'aws-test-object.txt';
                await new Promise((resolve) => {
                    // span 1
                    s3.createBucket({ Bucket: bucketName }, async function (err, data) {
                        const params = {
                            Bucket: bucketName,
                            Key: keyName,
                            Body: 'Hello World!',
                        };
                        // span 2
                        s3.putObject(params, function (err, data) {
                            if (err) console.log(err);
                            resolve({});
                        });
                    });
                });

                const awsSpans = getAwsSpans();
                expect(awsSpans.length).toBe(2);
                const [spanCreateBucket, spanPutObject] = awsSpans;

                expect(spanCreateBucket.attributes[AttributeNames.COMPONENT]).toBe('aws-sdk');
                expect(spanCreateBucket.attributes[AttributeNames.AWS_OPERATION]).toBe('createBucket');
                expect(spanCreateBucket.attributes[AttributeNames.AWS_SIGNATURE_VERSION]).toBe('s3');
                expect(spanCreateBucket.attributes[AttributeNames.AWS_SERVICE_API]).toBe('S3');
                expect(spanCreateBucket.attributes[AttributeNames.AWS_SERVICE_IDENTIFIER]).toBe('s3');
                expect(spanCreateBucket.attributes[AttributeNames.AWS_SERVICE_NAME]).toBe('Amazon S3');
                expect(spanCreateBucket.attributes[AttributeNames.AWS_REQUEST_ID]).toBe(responseMockSuccess.requestId);
                expect(spanCreateBucket.name).toBe('aws.s3.createBucket');

                expect(spanPutObject.attributes[AttributeNames.COMPONENT]).toBe('aws-sdk');
                expect(spanPutObject.attributes[AttributeNames.AWS_OPERATION]).toBe('putObject');
                expect(spanPutObject.attributes[AttributeNames.AWS_SIGNATURE_VERSION]).toBe('s3');
                expect(spanPutObject.attributes[AttributeNames.AWS_SERVICE_API]).toBe('S3');
                expect(spanPutObject.attributes[AttributeNames.AWS_SERVICE_IDENTIFIER]).toBe('s3');
                expect(spanPutObject.attributes[AttributeNames.AWS_SERVICE_NAME]).toBe('Amazon S3');
                expect(spanPutObject.attributes[AttributeNames.AWS_REQUEST_ID]).toBe(responseMockSuccess.requestId);
                expect(spanPutObject.name).toBe('aws.s3.putObject');
            });

            it('adds proper number of spans with correct attributes if both, promise and callback were used', async () => {
                const s3 = new AWS.S3();
                const bucketName = 'aws-test-bucket';
                const keyName = 'aws-test-object.txt';
                await new Promise((resolve) => {
                    // span 1
                    s3.createBucket({ Bucket: bucketName }, async function (err, data) {
                        const params = {
                            Bucket: bucketName,
                            Key: keyName,
                            Body: 'Hello World!',
                        };

                        let reqPromise: Promise<any> | null = null;
                        let numberOfCalls = 0;
                        const cbPromise = new Promise(async (resolveCb) => {
                            // span 2
                            const request = s3.putObject(params, function (err, data) {
                                if (err) console.log(err);
                                numberOfCalls++;
                                if (numberOfCalls === 2) {
                                    resolveCb({});
                                }
                            });
                            // NO span
                            reqPromise = request.promise();
                        });

                        await Promise.all([cbPromise, reqPromise]).then(() => {
                            resolve({});
                        });
                    });
                });

                const awsSpans = getAwsSpans();
                expect(awsSpans.length).toBe(2);
                const [spanCreateBucket, spanPutObjectCb] = awsSpans;
                expect(spanCreateBucket.attributes[AttributeNames.AWS_OPERATION]).toBe('createBucket');
                expect(spanPutObjectCb.attributes[AttributeNames.AWS_OPERATION]).toBe('putObject');
            });

            it('adds proper number of spans with correct attributes if only promise was used', async () => {
                const s3 = new AWS.S3();
                const bucketName = 'aws-test-bucket';
                const keyName = 'aws-test-object.txt';
                await new Promise((resolve) => {
                    // span 1
                    s3.createBucket({ Bucket: bucketName }, async function (err, data) {
                        const params = {
                            Bucket: bucketName,
                            Key: keyName,
                            Body: 'Hello World!',
                        };

                        let reqPromise: Promise<any> | null = null;
                        // NO span
                        const request = s3.putObject(params);
                        // span 2
                        await request.promise();
                        resolve({});
                    });
                });

                const awsSpans = getAwsSpans();
                expect(awsSpans.length).toBe(2);
                const [spanCreateBucket, spanPutObjectCb] = awsSpans;
                expect(spanCreateBucket.attributes[AttributeNames.AWS_OPERATION]).toBe('createBucket');
                expect(spanPutObjectCb.attributes[AttributeNames.AWS_OPERATION]).toBe('putObject');
            });

            it('should create span if no callback is supplied', (done) => {
                const s3 = new AWS.S3();
                const bucketName = 'aws-test-bucket';

                s3.putObject({
                    Bucket: bucketName,
                    Key: 'key name from tests',
                    Body: 'Hello World!',
                }).send();

                setImmediate(() => {
                    const awsSpans = getAwsSpans();
                    expect(awsSpans.length).toBe(1);
                    done();
                });
            });
        });

        describe('send return error', () => {
            before(() => {
                mockAwsSend(responseMockWithError);
                instrumentation.disable();
                instrumentation.enable();
            });

            it('adds error attribute properly', async () => {
                const s3 = new AWS.S3();
                const bucketName = 'aws-test-bucket';
                await new Promise((resolve) => {
                    s3.createBucket({ Bucket: bucketName }, async function () {
                        resolve({});
                    });
                });

                const awsSpans = getAwsSpans();
                expect(awsSpans.length).toBe(1);
                const [spanCreateBucket] = awsSpans;
                expect(spanCreateBucket.attributes[AttributeNames.AWS_ERROR]).toBe(responseMockWithError.error);
            });
        });
    });

    describe('instrumentation config', () => {
        it('preRequestHook called and add request attribute to span', (done) => {
            mockAwsSend(responseMockSuccess, 'data returned from operation');
            const config = {
                preRequestHook: (span: Span, request: any) => {
                    span.setAttribute('attribute from hook', request.params['Bucket']);
                },
            };

            instrumentation.disable();
            instrumentation.setConfig(config);
            instrumentation.enable();

            const s3 = new AWS.S3();
            const bucketName = 'aws-test-bucket';

            s3.createBucket({ Bucket: bucketName }, async function (err, data) {
                const awsSpans = getAwsSpans();
                expect(awsSpans.length).toBe(1);
                expect(awsSpans[0].attributes['attribute from hook']).toStrictEqual(bucketName);
                done();
            });
        });

        it('preRequestHook throws does not fail span', (done) => {
            mockAwsSend(responseMockSuccess, 'data returned from operation');
            const config = {
                preRequestHook: (span: Span, request: any) => {
                    throw new Error('error from request hook');
                },
            };

            instrumentation.disable();
            instrumentation.setConfig(config);
            instrumentation.enable();

            const s3 = new AWS.S3();
            const bucketName = 'aws-test-bucket';

            s3.createBucket({ Bucket: bucketName }, async function (err, data) {
                const awsSpans = getAwsSpans();
                expect(awsSpans.length).toBe(1);
                expect(awsSpans[0].status.code).toStrictEqual(SpanStatusCode.UNSET);
                done();
            });
        });

        it('responseHook called and add response attribute to span', (done) => {
            mockAwsSend(responseMockSuccess, 'data returned from operation');
            const config = {
                responseHook: (span: Span, response: any) => {
                    span.setAttribute('attribute from response hook', response['data']);
                },
            };

            instrumentation.disable();
            instrumentation.setConfig(config);
            instrumentation.enable();

            const s3 = new AWS.S3();
            const bucketName = 'aws-test-bucket';

            s3.createBucket({ Bucket: bucketName }, async function (err, data) {
                const awsSpans = getAwsSpans();
                expect(awsSpans.length).toBe(1);
                expect(awsSpans[0].attributes['attribute from response hook']).toStrictEqual(
                    'data returned from operation'
                );
                done();
            });
        });

        it('suppressInternalInstrumentation set to true with send()', (done) => {
            mockAwsSend(responseMockSuccess, 'data returned from operation', true);
            const config = {
                suppressInternalInstrumentation: true,
            };

            instrumentation.disable();
            instrumentation.setConfig(config);
            instrumentation.enable();

            const s3 = new AWS.S3();

            s3.createBucket({ Bucket: 'aws-test-bucket' }, function (err, data) {
                const awsSpans = getAwsSpans();
                expect(awsSpans.length).toBe(1);
                done();
            });
        });

        it('suppressInternalInstrumentation set to true with promise()', async () => {
            mockAwsSend(responseMockSuccess, 'data returned from operation', true);
            const config = {
                suppressInternalInstrumentation: true,
            };

            instrumentation.disable();
            instrumentation.setConfig(config);
            instrumentation.enable();

            const s3 = new AWS.S3();

            await s3.createBucket({ Bucket: 'aws-test-bucket' }).promise();
            const awsSpans = getAwsSpans();
            expect(awsSpans.length).toBe(1);
        });

        it('setting moduleVersionAttributeName is adding module version', async () => {
            mockAwsSend(responseMockSuccess, 'data returned from operation', true);
            const config = {
                moduleVersionAttributeName: 'module.version',
                suppressInternalInstrumentation: true
            };

            instrumentation.disable();
            instrumentation.setConfig(config);
            instrumentation.enable();

            const s3 = new AWS.S3();

            await s3.createBucket({ Bucket: 'aws-test-bucket' }).promise();
            const awsSpans = getAwsSpans();
            expect(awsSpans.length).toBe(1);
            console.log(awsSpans[0].attributes);

            expect(typeof awsSpans[0].attributes['module.version']).toBe('string');
        });
    });
});

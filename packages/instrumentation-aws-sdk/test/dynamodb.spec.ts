import 'mocha';
import { AwsInstrumentation } from '../src';
import { mockAwsSend } from './testing-utils';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
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

describe('DynamoDB', () => {
    before(() => {
        AWS.config.credentials = {
            accessKeyId: 'test key id',
            expired: false,
            expireTime: null,
            secretAccessKey: 'test acc key',
            sessionToken: 'test token',
        };
    });

    afterEach(() => {
        instrumentation.disable();
    });

    describe('Query', () => {
        beforeEach(() => {
            mockAwsSend(responseMockSuccess, {
                Items: [{ key1: 'val1' }, { key2: 'val2' }],
                Count: 2,
                ScannedCount: 5,
            } as AWS.DynamoDB.Types.QueryOutput);
            instrumentation.disable();
            instrumentation.enable();
        });

        it('should populate specific Query attributes', (done) => {
            const dynamodb = new AWS.DynamoDB.DocumentClient();
            const params = {
                TableName: 'test-table',
                KeyConditionExpression: '#k = :v',
                ExpressionAttributeNames: {
                    '#k': 'key1',
                },
                ExpressionAttributeValues: {
                    ':v': 'val1',
                },
            };
            dynamodb.query(params, (err: AWSError, data: AWS.DynamoDB.DocumentClient.QueryOutput) => {
                const spans = getTestSpans();
                expect(spans.length).toStrictEqual(1);
                const attrs = spans[0].attributes;
                expect(attrs[SemanticAttributes.DB_SYSTEM]).toStrictEqual('dynamodb');
                expect(attrs[SemanticAttributes.DB_NAME]).toStrictEqual('test-table');
                expect(attrs[SemanticAttributes.DB_OPERATION]).toStrictEqual('Query');
                expect(JSON.parse(attrs[SemanticAttributes.DB_STATEMENT] as string)).toEqual(params);
                expect(err).toBeFalsy();
                done();
            });
        });
    });

    describe('BatchGetIem', () => {
        beforeEach(() => {
            mockAwsSend(responseMockSuccess, {
                Responses: { 'test-table': [{ key1: { S: 'val1' } }] },
                UnprocessedKeys: {},
                ConsumedCapacity: [
                    {
                        TableName: 'test-table',
                        CapacityUnits: 0.5,
                        Table: { CapacityUnits: 0.5 },
                    },
                ],
            } as AWS.DynamoDB.Types.BatchGetItemOutput);
            instrumentation.disable();
            instrumentation.enable();
        });
        it('should populate specific BatchGetIem attributes', (done) => {
            const dynamodb = new AWS.DynamoDB.DocumentClient();
            const dynamodb_params = {
                RequestItems: {
                    'test-table': {
                        Keys: [{ key1: { S: 'val1' } }],
                        ProjectionExpression: 'id',
                    },
                },
                ReturnConsumedCapacity: 'INDEXES',
            };
            dynamodb.batchGet(
                dynamodb_params,
                (err: AWSError, data: AWS.DynamoDB.DocumentClient.BatchGetItemOutput) => {
                    const spans = getTestSpans();
                    expect(spans.length).toStrictEqual(1);
                    const attrs = spans[0].attributes;
                    expect(attrs[SemanticAttributes.DB_SYSTEM]).toStrictEqual('dynamodb');
                    expect(attrs[SemanticAttributes.DB_OPERATION]).toStrictEqual('BatchGetItem');
                    expect(attrs[SemanticAttributes.AWS_DYNAMODB_TABLE_NAMES]).toStrictEqual(['test-table']);
                    expect(attrs[SemanticAttributes.AWS_DYNAMODB_CONSUMED_CAPACITY]).toStrictEqual(
                        [
                            {
                                TableName: 'test-table',
                                CapacityUnits: 0.5,
                                Table: { CapacityUnits: 0.5 },
                            },
                        ].map((x: Object) => JSON.stringify(x))
                    );
                    expect(JSON.parse(attrs[SemanticAttributes.DB_STATEMENT] as string)).toEqual(dynamodb_params);
                    expect(err).toBeFalsy();
                    done();
                }
            );
        });
    });
});

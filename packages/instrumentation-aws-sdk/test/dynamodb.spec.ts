import 'mocha';
import { AwsInstrumentation } from '../src';
import { trace } from '@opentelemetry/api';
import { mockAwsSend } from './testing-utils';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import expect from 'expect';
import { getTestSpans } from 'opentelemetry-instrumentation-testing-utils';

const instrumentation = new AwsInstrumentation();
instrumentation.setTracerProvider(trace.getTracerProvider());
instrumentation.enable();
import AWS, { AWSError } from 'aws-sdk';
instrumentation.disable();

const responseMockSuccess = {
    requestId: '0000000000000',
    error: null,
};

describe('dynamodb', () => {
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
            Items: [{ key1: 'val1' }, { key2: 'val2' }],
            Count: 2,
            ScannedCount: 5,
        } as AWS.DynamoDB.Types.QueryOutput);
    });

    afterEach(() => {
        instrumentation.disable();
    });

    describe('receive context', () => {
        beforeEach(() => {
            instrumentation.disable();
            instrumentation.enable();
        });

        it('should add db attributes to dynamodb request', (done) => {
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
                expect(attrs[SemanticAttributes.DB_OPERATION]).toStrictEqual('query');
                expect(JSON.parse(attrs[SemanticAttributes.DB_STATEMENT] as string)).toEqual(params);
                expect(err).toBeFalsy();
                done();
            });
        });
    });
});

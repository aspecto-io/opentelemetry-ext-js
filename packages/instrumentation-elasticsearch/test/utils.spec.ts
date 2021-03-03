import 'mocha';
import { stub, assert, spy } from 'sinon';
import { expect } from 'chai';
import * as Utils from '../src/utils';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { DatabaseAttribute, GeneralAttribute } from '@opentelemetry/semantic-conventions';

describe('elasticsearch utils', () => {
    const spanMock = {
        recordException: (err) => {},
        setStatus: (obj) => {},
        end: () => {},
        setAttributes: (obj) => {},
    };

    context('defaultDbStatementSerializer', () => {
        it('should serialize', () => {
            const result = Utils.defaultDbStatementSerializer('operationName', { index: 'test' }, {});
            expect(result).to.equal('{"params":{"index":"test"},"options":{}}');
        });
    });

    context('onError', () => {
        it('should record error', () => {
            const recordExceptionStub = stub(spanMock, 'recordException');
            const setStatusStub = stub(spanMock, 'setStatus');
            const endStub = stub(spanMock, 'end');

            const error = new Error('test error');

            // @ts-ignore
            Utils.onError(spanMock, error);

            assert.calledOnce(recordExceptionStub);
            assert.calledWith(recordExceptionStub, error);

            assert.calledOnce(setStatusStub);
            assert.calledWith(setStatusStub, { code: SpanStatusCode.ERROR, message: error.message });

            assert.calledOnce(endStub);

            recordExceptionStub.restore();
            setStatusStub.restore();
            endStub.restore();
        });
    });

    context('onResponse', () => {
        it('should record response without responseHook', () => {
            const setAttributesStub = stub(spanMock, 'setAttributes');
            const setStatusStub = stub(spanMock, 'setStatus');
            const endStub = stub(spanMock, 'end');

            // @ts-ignore
            Utils.onResponse(spanMock, { meta: { connection: { url: 'http://localhost' } } });

            assert.calledOnce(setAttributesStub);
            assert.calledOnce(setStatusStub);
            assert.calledOnce(endStub);
            assert.calledWith(setStatusStub, { code: SpanStatusCode.OK });

            setAttributesStub.restore();
            setStatusStub.restore();
            endStub.restore();
        });

        it('should record response with responseHook', () => {
            const setAttributesStub = stub(spanMock, 'setAttributes');
            const setStatusStub = stub(spanMock, 'setStatus');
            const endStub = stub(spanMock, 'end');

            const responseHook = spy();

            // @ts-ignore
            Utils.onResponse(spanMock, { meta: { connection: { url: 'http://localhost' } } }, responseHook);

            assert.calledOnce(setAttributesStub);
            assert.calledOnce(setStatusStub);
            assert.calledOnce(endStub);
            assert.calledWith(setStatusStub, { code: SpanStatusCode.OK });

            expect(responseHook.called).to.be.true;

            setAttributesStub.restore();
            setStatusStub.restore();
            endStub.restore();
        });
    });

    context('getNetAttributes', () => {
        const url = 'http://localhost:9200';
        const attributes = Utils.getNetAttributes(url);

        it('should get hostname from url', () => {
            expect(attributes[GeneralAttribute.NET_PEER_NAME]).to.equal('localhost');
        });

        it('should get hostname from url', () => {
            expect(attributes[GeneralAttribute.NET_PEER_PORT]).to.equal('9200');
        });

        it('should set net.transport', () => {
            expect(attributes[GeneralAttribute.NET_TRANSPORT]).to.equal('IP.TCP');
        });
    });

    context('getPort', () => {
        it('should get port', () => {
            const result = Utils.getPort('3030', 'http:');
            expect(result).to.equal('3030');
        });

        it('should get port from http protocol', () => {
            const result = Utils.getPort('', 'http:');
            expect(result).to.equal('80');
        });

        it('should get port from https protocol', () => {
            const result = Utils.getPort('', 'https:');
            expect(result).to.equal('443');
        });
    });

    context('normalizeArguments', () => {
        it('should normalize with callback only', () => {
            const callbackFunction = () => {};
            // @ts-ignore
            const [params, options, callback] = Utils.normalizeArguments(callbackFunction);

            expect(params).to.be.empty;
            expect(options).to.be.empty;
            expect(callback).to.be.equal(callbackFunction);
        });

        it('should normalize with params only', () => {
            // @ts-ignore
            const [params, options, callback] = Utils.normalizeArguments({ index: 'test' });

            expect(params).to.deep.equal({ index: 'test' });
            expect(options).to.be.undefined;
            expect(callback).to.be.undefined;
        });
    });

    context('getIndexName', () => {
        it('should accept index string', () => {
            const index = Utils.getIndexName({ index: 'test' });
            expect(index).to.equal('test');
        });

        it('should accept index array', () => {
            const indexes = Utils.getIndexName({ index: ['index1', 'index2'] });

            expect(indexes).to.equal('index1,index2');
        });

        it('should accept no index', () => {
            const undefinedParams = Utils.getIndexName(undefined);
            const emptyObject = Utils.getIndexName({});

            expect(undefinedParams).to.be.undefined;
            expect(emptyObject).to.be.undefined;
        });

        it('should ignore unexpected index', () => {
            const functionIndex = Utils.getIndexName({ index: () => {} });
            const objectIndex = Utils.getIndexName({ index: {} });

            expect(functionIndex).to.be.undefined;
            expect(objectIndex).to.be.undefined;
        });
    });

    context('startSpan', () => {
        const tracerMock = {
            startSpan: (name, options?, context?): any => {},
        };
        it('should start span with client kink', () => {
            const startSpanStub = stub(tracerMock, 'startSpan');

            Utils.startSpan({
                tracer: tracerMock,
                attributes: { testAttribute: 'testValue' },
            });

            assert.calledOnce(startSpanStub);

            const [operation, options] = startSpanStub.getCall(0).args;

            expect(operation).to.equal('elasticsearch.request');
            expect(options.kind).to.equal(SpanKind.CLIENT);
            expect(options.attributes[DatabaseAttribute.DB_SYSTEM]).to.equal('elasticsearch');
            expect(options.attributes.testAttribute).to.equal('testValue');
        });
    });
});

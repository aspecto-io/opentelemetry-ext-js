import expect from 'expect';
import { ReadableSpan } from '@opentelemetry/tracing';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { SpanStatusCode } from '@opentelemetry/api';
import { SerializerPayload } from '../src';

export const assertSpan = (span: ReadableSpan) => {
    expect(span.status.code).toBe(SpanStatusCode.UNSET);
    expect(span.attributes[SemanticAttributes.DB_SYSTEM]).toEqual('mongodb');
    expect(span.attributes[SemanticAttributes.DB_MONGODB_COLLECTION]).toEqual('users');
    expect(span.attributes[SemanticAttributes.DB_NAME]).toEqual('test');
    expect(span.attributes[SemanticAttributes.NET_PEER_NAME]).toEqual('localhost');
    expect(span.attributes[SemanticAttributes.NET_PEER_PORT]).toEqual(27017);
    expect(span.attributes[SemanticAttributes.NET_TRANSPORT]).toEqual('IP.TCP');
};

export const getStatement = (span: ReadableSpan): SerializerPayload =>
    JSON.parse(span.attributes[SemanticAttributes.DB_STATEMENT] as string);

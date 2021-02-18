import expect from 'expect';
import { ReadableSpan } from '@opentelemetry/tracing';
import { DatabaseAttribute, GeneralAttribute } from '@opentelemetry/semantic-conventions';
import { SpanStatusCode } from '@opentelemetry/api';
import { SerializerPayload } from '../src';

export const assertSpan = (span: ReadableSpan) => {
    expect(span.status.code).toBe(SpanStatusCode.UNSET);
    expect(span.attributes[DatabaseAttribute.DB_SYSTEM]).toEqual('mongodb');
    expect(span.attributes[DatabaseAttribute.DB_MONGODB_COLLECTION]).toEqual('users');
    expect(span.attributes[DatabaseAttribute.DB_NAME]).toEqual('test');
    expect(span.attributes[GeneralAttribute.NET_PEER_NAME]).toEqual('localhost');
    expect(span.attributes[GeneralAttribute.NET_PEER_PORT]).toEqual(27017);
    expect(span.attributes[GeneralAttribute.NET_TRANSPORT]).toEqual('IP.TCP');
};

export const getStatement = (span: ReadableSpan): SerializerPayload =>
    JSON.parse(span.attributes[DatabaseAttribute.DB_STATEMENT] as string);

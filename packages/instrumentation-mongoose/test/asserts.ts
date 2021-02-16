import expect from 'expect';
import { ReadableSpan } from '@opentelemetry/tracing';
import { DatabaseAttribute, GeneralAttribute } from '@opentelemetry/semantic-conventions';
import { StatusCode } from '@opentelemetry/api';

export const assertSpan = (span: ReadableSpan) => {
    expect(span.status.code).toBe(StatusCode.UNSET);
    expect(span.attributes[DatabaseAttribute.DB_SYSTEM]).toEqual('mongodb');
    expect(span.attributes[DatabaseAttribute.DB_MONGODB_COLLECTION]).toEqual('users');
    expect(span.attributes[DatabaseAttribute.DB_NAME]).toEqual('test');
    expect(span.attributes[GeneralAttribute.NET_PEER_NAME]).toEqual('localhost');
    expect(span.attributes[GeneralAttribute.NET_PEER_PORT]).toEqual(27017);
    expect(span.attributes[GeneralAttribute.NET_TRANSPORT]).toEqual('IP.TCP');
}

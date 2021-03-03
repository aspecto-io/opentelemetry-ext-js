import expect from 'expect';
import { ReadableSpan } from '@opentelemetry/tracing';
import { DatabaseAttribute, GeneralAttribute } from '@opentelemetry/semantic-conventions';
import { SpanStatusCode } from '@opentelemetry/api';

export const assertSpan = (span: ReadableSpan) => {
    expect(span.status.code).toBe(SpanStatusCode.UNSET);
    expect(span.attributes[DatabaseAttribute.DB_SYSTEM]).toEqual('neo4j');
    expect(span.attributes[DatabaseAttribute.DB_NAME]).toEqual('neo4j');
    expect(span.attributes[DatabaseAttribute.DB_USER]).toEqual('neo4j');
    expect(span.attributes[GeneralAttribute.NET_PEER_NAME]).toEqual('localhost');
    expect(span.attributes[GeneralAttribute.NET_PEER_PORT]).toEqual(11011);
    expect(span.attributes[GeneralAttribute.NET_TRANSPORT]).toEqual('IP.TCP');
};
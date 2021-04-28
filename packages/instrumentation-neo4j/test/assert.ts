import expect from 'expect';
import { ReadableSpan } from '@opentelemetry/tracing';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';

export const assertSpan = (span: ReadableSpan) => {
    expect(span.kind).toBe(SpanKind.CLIENT);
    expect(span.status.code).toBe(SpanStatusCode.UNSET);
    expect(span.attributes[SemanticAttributes.DB_SYSTEM]).toEqual('neo4j');
    expect(span.attributes[SemanticAttributes.DB_NAME]).toEqual('neo4j');
    expect(span.attributes[SemanticAttributes.DB_USER]).toEqual('neo4j');
    expect(span.attributes[SemanticAttributes.NET_PEER_NAME]).toEqual('localhost');
    expect(span.attributes[SemanticAttributes.NET_PEER_PORT]).toEqual(11011);
    expect(span.attributes[SemanticAttributes.NET_TRANSPORT]).toEqual('IP.TCP');
};

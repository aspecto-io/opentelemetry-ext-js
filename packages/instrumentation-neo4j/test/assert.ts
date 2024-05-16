import expect from 'expect';
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import {
    SEMATTRS_DB_NAME,
    SEMATTRS_DB_SYSTEM,
    SEMATTRS_DB_USER,
    SEMATTRS_NET_PEER_NAME,
    SEMATTRS_NET_PEER_PORT,
    SEMATTRS_NET_TRANSPORT,
} from '@opentelemetry/semantic-conventions';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';

export const assertSpan = (span: ReadableSpan) => {
    expect(span.kind).toBe(SpanKind.CLIENT);
    expect(span.status.code).toBe(SpanStatusCode.UNSET);
    expect(span.attributes[SEMATTRS_DB_SYSTEM]).toEqual('neo4j');
    expect(span.attributes[SEMATTRS_DB_NAME]).toEqual('neo4j');
    expect(span.attributes[SEMATTRS_DB_USER]).toEqual('neo4j');
    expect(span.attributes[SEMATTRS_NET_PEER_NAME]).toEqual('localhost');
    expect(span.attributes[SEMATTRS_NET_PEER_PORT]).toEqual(11011);
    expect(span.attributes[SEMATTRS_NET_TRANSPORT]).toEqual('IP.TCP');
};

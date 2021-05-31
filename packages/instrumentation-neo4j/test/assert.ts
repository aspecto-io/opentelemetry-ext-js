import expect from 'expect';
import { SpanKind } from '@opentelemetry/api';
import { MalabiSpan } from 'malabi-extract';

export const assertSpan = (span: MalabiSpan) => {
    expect(span.kind).toBe(SpanKind.CLIENT);
    expect(span.hasError).toBeFalsy();
    expect(span.dbSystem).toEqual('neo4j');
    expect(span.dbName).toEqual('neo4j');
    expect(span.dbUser).toEqual('neo4j');
    expect(span.netPeerName).toEqual('localhost');
    expect(span.netPeerPort).toEqual(11011);
    expect(span.netTransport).toEqual('IP.TCP');
};

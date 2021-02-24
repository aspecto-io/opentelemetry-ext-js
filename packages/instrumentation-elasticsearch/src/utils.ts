import { Tracer, SpanAttributes, SpanStatusCode, diag, Span, SpanKind } from '@opentelemetry/api';
import { DbStatementSerializer, ElasticsearchResponseCustomAttributesFunction } from './types';
import { safeExecuteInTheMiddle } from '@opentelemetry/instrumentation';
import { DatabaseAttribute, GeneralAttribute } from '@opentelemetry/semantic-conventions';
import { ApiResponse } from '@elastic/elasticsearch/lib/Transport';

interface StartSpanPayload {
    tracer: Tracer;
    attributes: SpanAttributes;
}

export function startSpan({ tracer, attributes }: StartSpanPayload): Span {
    return tracer.startSpan('elasticsearch.request', {
        kind: SpanKind.CLIENT,
        attributes: {
            [DatabaseAttribute.DB_SYSTEM]: 'elasticsearch',
            ...attributes,
        },
    });
}

function getPort(port: string, protocol: string): string {
    if (port) return port;

    if (protocol === 'https:') return '443';
    if (protocol === 'http:') return '80';

    return '';
}

function getNetAttributes(url: string): SpanAttributes {
    const { port, protocol, hostname } = new URL(url);

    return {
        [GeneralAttribute.NET_TRANSPORT]: 'IP.TCP',
        [GeneralAttribute.NET_PEER_NAME]: hostname,
        [GeneralAttribute.NET_PEER_PORT]: getPort(port, protocol),
    };
}

export function onResponse(
    span: Span,
    result: ApiResponse,
    responseHook?: ElasticsearchResponseCustomAttributesFunction
) {
    span.setAttributes({
        ...getNetAttributes(result.meta.connection.url.toString()),
    });

    span.setStatus({
        code: SpanStatusCode.OK,
    });

    if (responseHook) {
        safeExecuteInTheMiddle(
            () => responseHook(span, result),
            (e) => {
                if (e) {
                    diag.error('elasticsearch instrumentation: responseHook error', e);
                }
            },
            true
        );
    }
}

export const defaultDbStatementSerializer: DbStatementSerializer = (params, options) =>
    JSON.stringify({ params, options });

import { Tracer, SpanAttributes, SpanStatusCode, diag, Span, SpanKind } from '@opentelemetry/api';
import { DbStatementSerializer, ResponseHook } from './types';
import { safeExecuteInTheMiddle } from '@opentelemetry/instrumentation';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { ApiResponse } from '@elastic/elasticsearch/lib/Transport';

interface StartSpanPayload {
    tracer: Tracer;
    attributes: SpanAttributes;
}

export function getIndexName(params) {
    if (!params?.index) {
        return undefined;
    }

    if (typeof params.index === 'string') {
        return params.index;
    }

    if (Array.isArray(params.index)) {
        return params.index.join(',');
    }
}

export function startSpan({ tracer, attributes }: StartSpanPayload): Span {
    return tracer.startSpan('elasticsearch.request', {
        kind: SpanKind.CLIENT,
        attributes: {
            [SemanticAttributes.DB_SYSTEM]: 'elasticsearch',
            ...attributes,
        },
    });
}

export function normalizeArguments(params, options, callback) {
    // Copied normalizeArguments function from @elastic/elasticsearch
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }
    if (typeof params === 'function' || params == null) {
        callback = params;
        params = {};
        options = {};
    }
    return [params, options, callback];
}

export function getPort(port: string, protocol: string): string {
    if (port) return port;

    if (protocol === 'https:') return '443';
    if (protocol === 'http:') return '80';

    return '';
}

export function getNetAttributes(url: string): SpanAttributes {
    const { port, protocol, hostname } = new URL(url);

    return {
        [SemanticAttributes.NET_TRANSPORT]: 'IP.TCP',
        [SemanticAttributes.NET_PEER_NAME]: hostname,
        [SemanticAttributes.NET_PEER_PORT]: getPort(port, protocol),
    };
}

export function onResponse(span: Span, result: ApiResponse, responseHook?: ResponseHook) {
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

    span.end();
}

export function onError(span: Span, err) {
    span.recordException(err);
    span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err.message,
    });

    span.end();
}

export const defaultDbStatementSerializer: DbStatementSerializer = (operation, params, options) =>
    JSON.stringify({ params, options });

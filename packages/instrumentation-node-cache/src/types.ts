import { InstrumentationConfig } from '@opentelemetry/instrumentation';
import { Span } from '@opentelemetry/api';

export interface NodeCacheRequestInfo {
    moduleVersion: string;
    operation: string;
    args: any[];
}

export interface NodeCacheResponseInfo {
    operation: string;
    response: any;
}

export interface NodeCacheInstrumentationConfig extends InstrumentationConfig {
    requestHook?: (span: Span, requestInfo: NodeCacheRequestInfo) => void;
    responseHook?: (span: Span, responseInfo: NodeCacheResponseInfo) => void;
    requireParentSpan?: boolean;
}

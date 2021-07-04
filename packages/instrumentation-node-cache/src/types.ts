import { InstrumentationConfig } from '@opentelemetry/instrumentation';
import { Span } from '@opentelemetry/api';

export interface NodeCacheRequestInfo {
    moduleVersion: string;
    operation: string;
    args: any[];
}

export interface NodeCacheInstrumentationConfig extends InstrumentationConfig {
    requestHook?: (span: Span, requestInfo: NodeCacheRequestInfo) => void;
    responseHook?: (span: Span, response: any) => void;
    requireParentSpan?: boolean;
}

import { InstrumentationConfig } from '@opentelemetry/instrumentation';
import { Span } from '@opentelemetry/api';

export interface NodeCacheInstrumentationConfig extends InstrumentationConfig {
    responseHook?: (span: Span, response: any) => void;
    requireParentSpan?: boolean;
}

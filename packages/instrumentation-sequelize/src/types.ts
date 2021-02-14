import { Span } from '@opentelemetry/api';
import { InstrumentationConfig } from '@opentelemetry/instrumentation';

export type SequelizeResponseCustomAttributesFunction = (span: Span, response: any) => void;

export interface SequelizeInstrumentationConfig extends InstrumentationConfig {
    /** hook for adding custom attributes using the response payload */
    responseHook?: SequelizeResponseCustomAttributesFunction;
    /** Set to true if you only want to trace operation which has parent spans */
    ignoreOrphanedSpans?: boolean;
}

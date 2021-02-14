import { Span } from '@opentelemetry/api';
import { InstrumentationConfig } from '@opentelemetry/instrumentation';

export type TypeormResponseCustomAttributesFunction = (span: Span, response: any) => void;

export interface TypeormInstrumentationConfig extends InstrumentationConfig {
    /** hook for adding custom attributes using the response payload */
    responseHook?: TypeormResponseCustomAttributesFunction;
}

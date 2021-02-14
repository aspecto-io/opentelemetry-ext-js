import { Span } from '@opentelemetry/api';
import { InstrumentationConfig } from '@opentelemetry/instrumentation';

export type TypeormResponseCustomAttributesFunction = (span: Span, response: any) => void;

export interface TypeormPluginConfig extends InstrumentationConfig {
    /** hook for adding custom attributes using the response payload */
    responseHook?: TypeormResponseCustomAttributesFunction;
}

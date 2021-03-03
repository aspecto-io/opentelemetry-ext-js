import { Span } from '@opentelemetry/api';
import { InstrumentationConfig } from '@opentelemetry/instrumentation';

export type TypeormResponseCustomAttributesFunction = (span: Span, response: any) => void;

export interface TypeormInstrumentationConfig extends InstrumentationConfig {
    /** hook for adding custom attributes using the response payload */
    responseHook?: TypeormResponseCustomAttributesFunction;
    /**
     * If passed, a span attribute will be added to all spans with key of the provided "moduleVersionAttributeName"
     * and value of the module version.
     */
    moduleVersionAttributeName?: string;
}

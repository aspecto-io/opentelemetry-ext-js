import { PluginConfig, Span } from '@opentelemetry/api';

export type TypeormResponseCustomAttributesFunction = (span: Span, response: any) => void;

export interface TypeormPluginConfig extends PluginConfig {
    /** hook for adding custom attributes using the response payload */
    responseHook?: TypeormResponseCustomAttributesFunction;
}

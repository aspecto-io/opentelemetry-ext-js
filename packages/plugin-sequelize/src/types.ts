import { PluginConfig, Span } from '@opentelemetry/api';

export type SequelizeResponseCustomAttributesFunction = (span: Span, response: any) => void;

export interface SequelizePluginConfig extends PluginConfig {
    /** hook for adding custom attributes using the response payload */
    responseHook?: SequelizeResponseCustomAttributesFunction;
    /** Set to true if you only want to trace operation which has parent spans */
    ignoreOrphanedSpans?: boolean;
}

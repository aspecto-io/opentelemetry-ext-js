import { Span } from '@opentelemetry/api';
import { InstrumentationConfig } from '@opentelemetry/instrumentation';

export interface SerializerPayload {
    condition?: any;
    options?: any;
    updates?: any;
    document?: any;
    aggregatePipeline?: any;
}

export type DbStatementSerializer = (params?: object, options?: object) => string;

export type ElasticsearchResponseCustomAttributesFunction = (span: Span, response: any) => void;

export interface ElasticsearchInstrumentationConfig extends InstrumentationConfig {
    /**
     * Elasticsearch operation use http/https under the hood.
     * If Elasticsearch instrumentation is enabled, an http/https operation will also create.
     * Setting the `suppressInternalInstrumentation` config value to `true` will
     * cause the instrumentation to suppress instrumentation of underlying operations,
     * effectively causing http/https spans to be non-recordable.
     */
    suppressInternalInstrumentation?: boolean;

    /** Custom serializer function for the db.statement tag */
    dbStatementSerializer?: DbStatementSerializer;

    /** hook for adding custom attributes using the response payload */
    responseHook?: ElasticsearchResponseCustomAttributesFunction;
}

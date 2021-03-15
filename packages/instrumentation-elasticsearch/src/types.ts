import { Span } from '@opentelemetry/api';
import { InstrumentationConfig } from '@opentelemetry/instrumentation';

export type DbStatementSerializer = (operation?: string, params?: object, options?: object) => string;

export type ResponseHook = (span: Span, response: any) => void;

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
    responseHook?: ResponseHook;

    /**
     * If passed, a span attribute will be added to all spans with key of the provided "moduleVersionAttributeName"
     * and value of the module version.
     */
    moduleVersionAttributeName?: string;
}

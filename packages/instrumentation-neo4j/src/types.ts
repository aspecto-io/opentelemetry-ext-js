import { Span } from '@opentelemetry/api';
import { InstrumentationConfig } from '@opentelemetry/instrumentation';
import type { QueryResult } from 'neo4j-driver';

export type Neo4jResponseCustomAttributesFunction = (span: Span, response: QueryResult) => void;

export interface Neo4jInstrumentationConfig extends InstrumentationConfig {
    /** hook for adding custom attributes using the response payload */
    responseHook?: Neo4jResponseCustomAttributesFunction;
    /** Set to true if you only want to trace operation which has parent spans */
    ignoreOrphanedSpans?: boolean;
    /** 
     * If passed, a span attribute will be added to all spans with key of the provided "moduleVersionAttributeName" 
     * and value of the module version.
     */
    moduleVersionAttributeName?: string;
}

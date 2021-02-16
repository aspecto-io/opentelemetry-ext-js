import { Span } from '@opentelemetry/api';
import { InstrumentationConfig } from '@opentelemetry/instrumentation';

export interface SerializerPayload {
    condition?: any;
    options?: any;
    updates?: any;
    document?: any;
    aggregatePipeline?: any;
}

export type DbStatementSerializer = (operation: string, payload: SerializerPayload) => string;

export type MongooseResponseCustomAttributesFunction = (span: Span, response: any) => void;

export interface MongooseInstrumentationConfig extends InstrumentationConfig {
    /**
     * Mongoose operation use mongodb under the hood.
     * If mongodb instrumentation is enabled, a mongoose operation will also create
     * a mongodb operation describing the communication with mongoDB servers.
     * Setting the `suppressInternalInstrumentation` config value to `true` will
     * cause the instrumentation to suppress instrumentation of underlying operations,
     * effectively causing mongodb spans to be non-recordable.
     */
    suppressInternalInstrumentation?: boolean;

    /** Custom serializer function for the db.statement tag */
    dbStatementSerializer?: DbStatementSerializer;

    /** hook for adding custom attributes using the response payload */
    responseHook?: MongooseResponseCustomAttributesFunction;
}

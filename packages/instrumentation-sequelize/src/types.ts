import { Span } from '@opentelemetry/api';
import { InstrumentationConfig } from '@opentelemetry/instrumentation';

export type SequelizeResponseCustomAttributesFunction = (span: Span, response: any) => void;

export interface SequelizeInstrumentationConfig extends InstrumentationConfig {
    /** hook for adding custom attributes using the response payload */
    responseHook?: SequelizeResponseCustomAttributesFunction;
    /** Set to true if you only want to trace operation which has parent spans */
    ignoreOrphanedSpans?: boolean;
    /**
     * If passed, a span attribute will be added to all spans with key of the provided "moduleVersionAttributeName"
     * and value of the module version.
     */
    moduleVersionAttributeName?: string;
    /**
     * Sequelize operation use postgres/mysql/mariadb/etc. under the hood.
     * If, for example, postgres instrumentation is enabled, a postgres operation will also create
     * a postgres span describing the communication.
     * Setting the `suppressInternalInstrumentation` config value to `true` will
     * cause the instrumentation to suppress instrumentation of underlying operations.
     */
    suppressInternalInstrumentation?: boolean;

    /**
     * Disables output of full SQL query into the span attribute
     */
    suppressSqlQuery?: boolean;

    /**
     * Capture runtime stack trace for each span in `runtime.stacktrace` attribute
     */
    captureStackTrace?: boolean;
}

export enum SequelizeAttributes {
    RUNTIME_STACKTRACE = 'runtime.stacktrace'
}

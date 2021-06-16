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
    /**
     * Typeorm operation use mongodb/postgres/mysql/mariadb/etc. under the hood.
     * If, for example, postgres instrumentation is enabled, a postgres operation will also create
     * a postgres span describing the communication.
     * Setting the `suppressInternalInstrumentation` config value to `true` will
     * cause the instrumentation to suppress instrumentation of underlying operations.
     */
    suppressInternalInstrumentation?: boolean;
    /** Some methods such as `getManyAndCount` can generate internally multiple spans. 
     * To instrument those set this to `true`
     */
    enableInternalInstrumentation?: boolean;
}

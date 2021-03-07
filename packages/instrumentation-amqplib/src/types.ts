import { Span } from '@opentelemetry/api';
import { InstrumentationConfig } from '@opentelemetry/instrumentation';
import type amqp from 'amqplib';

export interface PublishParams {
    exchange: string;
    routingKey: string;
    content: Buffer;
    options?: amqp.Options.Publish;
}

export interface AmqplibPublishCustomAttributeFunction {
    (span: Span, publishParams: PublishParams): void;
}

export interface AmqplibConsumerCustomAttributeFunction {
    (span: Span, msg: amqp.ConsumeMessage | null): void;
}

export interface AmqplibInstrumentationConfig extends InstrumentationConfig {
    /** hook for adding custom attributes before publish message is sent */
    publishHook?: AmqplibPublishCustomAttributeFunction;

    /** hook for adding custom attributes before consumer message is processed */
    consumerHook?: AmqplibConsumerCustomAttributeFunction;

    /**
     * If passed, a span attribute will be added to all spans with key of the provided "moduleVersionAttributeName"
     * and value of the module version.
     */
    moduleVersionAttributeName?: string;
}

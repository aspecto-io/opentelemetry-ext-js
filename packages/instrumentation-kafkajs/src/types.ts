import { Span } from '@opentelemetry/api';
import { InstrumentationConfig } from '@opentelemetry/instrumentation';
import { Message } from 'kafkajs';

export interface KafkaProducerCustomAttributeFunction {
    (span: Span, topic: string, message: Message): void;
}

export interface KafkaConsumerCustomAttributeFunction {
    (span: Span, topic: string, message: Message): void;
}

export interface KafkaJsInstrumentationConfig extends InstrumentationConfig {
    /** hook for adding custom attributes before producer message is sent */
    producerHook?: KafkaProducerCustomAttributeFunction;

    /** hook for adding custom attributes before consumer message is processed */
    consumerHook?: KafkaConsumerCustomAttributeFunction;

    /** 
     * If passed, a span attribute will be added to all spans with key of the provided "moduleVersionAttributeName" 
     * and value of the module version.
     */
    moduleVersionAttributeName?: string;
}

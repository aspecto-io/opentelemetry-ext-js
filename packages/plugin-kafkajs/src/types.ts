import { PluginConfig, Span } from "@opentelemetry/api";
import { Message } from "kafkajs";

export interface KafkaProducerCustomAttributeFunction {
  (span: Span, topic: string, message: Message): void;
}

export interface KafkaConsumerCustomAttributeFunction {
  (span: Span, topic: string, message: Message): void;
}

export interface KafkaJsPluginConfig extends PluginConfig {
  /** hook for adding custom attributes before producer message is sent */
  producerHook?: KafkaProducerCustomAttributeFunction;

  /** hook for adding custom attributes before consumer message is processed */
  consumerHook?: KafkaConsumerCustomAttributeFunction;
}

import { BasePlugin } from '@opentelemetry/core';
import {
    SpanKind,
    Span,
    StatusCode,
    Context,
    propagation,
    Link,
    getActiveSpan,
    setActiveSpan,
    context,
} from '@opentelemetry/api';
import { ROOT_CONTEXT } from '@opentelemetry/context-base';
import { MessagingAttribute, MessagingOperationName } from '@opentelemetry/semantic-conventions';
import * as shimmer from 'shimmer';
import * as kafkaJs from 'kafkajs';
import {
    Producer,
    ProducerBatch,
    RecordMetadata,
    Message,
    ProducerRecord,
    ConsumerRunConfig,
    EachMessagePayload,
    KafkaMessage,
    EachBatchPayload,
    Consumer,
} from 'kafkajs';
import { KafkaJsPluginConfig } from './types';
import { VERSION } from './version';
import { bufferTextMapGetter } from './propagtor';

export class KafkaJsPlugin extends BasePlugin<typeof kafkaJs> {
    protected _config!: KafkaJsPluginConfig;

    constructor(readonly moduleName: string) {
        super('opentelemetry-plugin-kafkajs', VERSION);
    }

    protected patch() {
        this._logger.debug('kafkajs: patch kafkajs plugin');

        shimmer.wrap(this._moduleExports?.Kafka?.prototype, 'producer', this._getProducerPatch.bind(this));
        shimmer.wrap(this._moduleExports?.Kafka?.prototype, 'consumer', this._getConsumerPatch.bind(this));

        return this._moduleExports;
    }

    protected unpatch() {
        this._logger.debug('kafkajs: unpatch kafkajs plugin');
        shimmer.unwrap(this._moduleExports?.Kafka?.prototype, 'producer');
        shimmer.unwrap(this._moduleExports?.Kafka?.prototype, 'consumer');
    }

    private _getConsumerPatch(original: (...args: unknown[]) => Producer) {
        const thisPlugin = this;
        return function (...args: unknown[]): Consumer {
            const newConsumer: Consumer = original.apply(this, arguments);
            shimmer.wrap(newConsumer, 'run', thisPlugin._getConsumerRunPatch.bind(thisPlugin));
            return newConsumer;
        };
    }

    private _getProducerPatch(original: (...args: unknown[]) => Producer) {
        const thisPlugin = this;
        return function (...args: unknown[]): Producer {
            const newProducer: Producer = original.apply(this, arguments);
            shimmer.wrap(newProducer, 'sendBatch', thisPlugin._getProducerSendBatchPatch.bind(thisPlugin));
            shimmer.wrap(newProducer, 'send', thisPlugin._getProducerSendPatch.bind(thisPlugin));
            return newProducer;
        };
    }

    private _getConsumerRunPatch(original: (...args: unknown[]) => Producer) {
        const thisPlugin = this;
        return function (config?: ConsumerRunConfig): Promise<void> {
            if (config?.eachMessage) {
                shimmer.wrap(config, 'eachMessage', thisPlugin._getConsumerEachMessagePatch.bind(thisPlugin));
            }
            if (config?.eachBatch) {
                shimmer.wrap(config, 'eachBatch', thisPlugin._getConsumerEachBatchPatch.bind(thisPlugin));
            }
            return original.call(this, config);
        };
    }

    private _getConsumerEachMessagePatch(original: (...args: unknown[]) => Promise<void>) {
        const thisPlugin = this;
        return function (payload: EachMessagePayload): Promise<void> {
            const propagatedContext: Context = propagation.extract(
                ROOT_CONTEXT,
                payload.message.headers,
                bufferTextMapGetter
            );
            const span = thisPlugin._startConsumerSpan(
                payload.topic,
                payload.message,
                MessagingOperationName.PROCESS,
                propagatedContext
            );

            const eachMessagePromise = thisPlugin._tracer.withSpan(span, () => {
                return original.apply(this, arguments);
            });
            return thisPlugin._endSpansOnPromise([span], eachMessagePromise);
        };
    }

    private _getConsumerEachBatchPatch(original: (...args: unknown[]) => Promise<void>) {
        const thisPlugin = this;
        return function (payload: EachBatchPayload): Promise<void> {
            // https://github.com/open-telemetry/opentelemetry-specification/blob/master/specification/trace/semantic_conventions/messaging.md#topic-with-multiple-consumers
            const receivingSpan = thisPlugin._startConsumerSpan(
                payload.batch.topic,
                undefined,
                MessagingOperationName.RECEIVE,
                ROOT_CONTEXT
            );
            return thisPlugin._tracer.withSpan(receivingSpan, () => {
                const spans = payload.batch.messages.map((message: KafkaMessage) => {
                    const propagatedContext: Context = propagation.extract(
                        ROOT_CONTEXT,
                        message.headers,
                        bufferTextMapGetter
                    );
                    const spanContext = getActiveSpan(propagatedContext)?.context();
                    let origSpanLink: Link;
                    if (spanContext) {
                        origSpanLink = {
                            context: spanContext,
                        };
                    }
                    return thisPlugin._startConsumerSpan(
                        payload.batch.topic,
                        message,
                        MessagingOperationName.PROCESS,
                        undefined,
                        origSpanLink
                    );
                });
                const batchMessagePromise: Promise<void> = original.apply(this, arguments);
                spans.unshift(receivingSpan);
                return thisPlugin._endSpansOnPromise(spans, batchMessagePromise);
            });
        };
    }

    private _getProducerSendBatchPatch(original: (batch: ProducerBatch) => Promise<RecordMetadata[]>) {
        const thisPlugin = this;
        return function (batch: ProducerBatch): Promise<RecordMetadata[]> {
            const spans: Span[] = batch.topicMessages.flatMap((topicMessage) =>
                topicMessage.messages.map((message) => thisPlugin._startProducerSpan(topicMessage.topic, message))
            );

            const origSendResult: Promise<RecordMetadata[]> = original.apply(this, arguments);
            return thisPlugin._endSpansOnPromise(spans, origSendResult);
        };
    }

    private _getProducerSendPatch(original: (record: ProducerRecord) => Promise<RecordMetadata[]>) {
        const thisPlugin = this;
        return function (record: ProducerRecord): Promise<RecordMetadata[]> {
            const spans: Span[] = record.messages.map((message) => {
                return thisPlugin._startProducerSpan(record.topic, message);
            });

            const origSendResult: Promise<RecordMetadata[]> = original.apply(this, arguments);
            return thisPlugin._endSpansOnPromise(spans, origSendResult);
        };
    }

    private _endSpansOnPromise<T>(spans: Span[], sendPromise: Promise<T>): Promise<T> {
        return sendPromise
            .catch((reason) => {
                let errorMessage;
                if (typeof reason === 'string') errorMessage = reason;
                else if (typeof reason === 'object' && reason.hasOwnProperty('message')) errorMessage = reason.message;

                spans.forEach((span) =>
                    span.setStatus({
                        code: StatusCode.ERROR,
                        message: errorMessage,
                    })
                );

                throw reason;
            })
            .finally(() => {
                spans.forEach((span) => span.end());
            });
    }

    private _startConsumerSpan(topic: string, message: KafkaMessage, operation: string, context: Context, link?: Link) {
        const span = this._tracer.startSpan(
            topic,
            {
                kind: SpanKind.CONSUMER,
                attributes: {
                    [MessagingAttribute.MESSAGING_SYSTEM]: 'kafka',
                    [MessagingAttribute.MESSAGING_DESTINATION]: topic,
                    [MessagingAttribute.MESSAGING_DESTINATION_KIND]: 'topic',
                    [MessagingAttribute.MESSAGING_OPERATION]: operation,
                },
                links: link ? [link] : [],
            },
            context
        );

        if (this._config?.consumerHook && message) {
            this._safeExecute([], () => this._config.consumerHook!(span, topic, message), false);
        }

        return span;
    }

    private _startProducerSpan(topic: string, message: Message) {
        const span = this._tracer.startSpan(topic, {
            kind: SpanKind.PRODUCER,
            attributes: {
                [MessagingAttribute.MESSAGING_SYSTEM]: 'kafka',
                [MessagingAttribute.MESSAGING_DESTINATION]: topic,
                [MessagingAttribute.MESSAGING_DESTINATION_KIND]: 'topic',
            },
        });

        message.headers = message.headers ?? {};
        propagation.inject(setActiveSpan(context.active(), span), message.headers);

        if (this._config?.producerHook) {
            this._safeExecute([], () => this._config.producerHook!(span, topic, message), false);
        }

        return span;
    }

    private _safeExecute<T extends (...args: unknown[]) => ReturnType<T>>(
        spans: Span[],
        execute: T,
        rethrow: boolean
    ): ReturnType<T> | void {
        try {
            return execute();
        } catch (error) {
            if (rethrow) {
                spans.forEach((span) => {
                    span.setStatus({
                        code: StatusCode.ERROR,
                        message: error?.message,
                    });
                    span.end();
                });
                throw error;
            }
            this._logger.error('caught error ', error);
        }
    }
}

export const plugin = new KafkaJsPlugin('kafkajs');

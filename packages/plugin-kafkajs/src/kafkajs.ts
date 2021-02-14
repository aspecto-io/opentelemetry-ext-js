import { SpanKind, Span, StatusCode, Context, propagation, Link, getSpan, setSpan, context } from '@opentelemetry/api';
import { ROOT_CONTEXT } from '@opentelemetry/context-base';
import { MessagingAttribute, MessagingOperationName } from '@opentelemetry/semantic-conventions';
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
import { KafkaJsInstrumentationConfig } from './types';
import { VERSION } from './version';
import { bufferTextMapGetter } from './propagtor';
import {
    InstrumentationBase,
    InstrumentationConfig,
    InstrumentationModuleDefinition,
    InstrumentationNodeModuleDefinition,
    safeExecuteInTheMiddle,
    isWrapped,
} from '@opentelemetry/instrumentation';

type Config = InstrumentationConfig & KafkaJsInstrumentationConfig;

export class KafkaJsInstrumentation extends InstrumentationBase<typeof kafkaJs> {
    static readonly component = 'kafkajs';
    protected _config!: Config;

    constructor(config: Config = {}) {
        super('opentelemetry-instrumentation-kafkajs', VERSION, Object.assign({}, config));
    }

    setConfig(config: Config = {}) {
        this._config = Object.assign({}, config);
    }

    get logger() {
        return this._config.logger ?? this._logger;
    }

    protected init(): InstrumentationModuleDefinition<typeof kafkaJs> {
        const module = new InstrumentationNodeModuleDefinition<typeof kafkaJs>(
            KafkaJsInstrumentation.component,
            ['*'],
            this.patch.bind(this),
            this.unpatch.bind(this)
        );
        return module;
    }

    protected patch(moduleExports: typeof kafkaJs) {
        this.logger.debug('kafkajs: patch kafkajs plugin');

        this.unpatch(moduleExports);
        this._wrap(moduleExports?.Kafka?.prototype, 'producer', this._getProducerPatch.bind(this));
        this._wrap(moduleExports?.Kafka?.prototype, 'consumer', this._getConsumerPatch.bind(this));

        return moduleExports;
    }

    protected unpatch(moduleExports: typeof kafkaJs) {
        this.logger.debug('kafkajs: unpatch kafkajs plugin');
        if (isWrapped(moduleExports?.Kafka?.prototype.producer)) {
            this._unwrap(moduleExports.Kafka.prototype, 'producer');
        }
        if (isWrapped(moduleExports?.Kafka?.prototype.consumer)) {
            this._unwrap(moduleExports.Kafka.prototype, 'consumer');
        }
    }

    private _getConsumerPatch(original: (...args: unknown[]) => Producer) {
        const thisPlugin = this;
        return function (...args: unknown[]): Consumer {
            const newConsumer: Consumer = original.apply(this, arguments);

            if (isWrapped(newConsumer.run)) {
                thisPlugin._unwrap(newConsumer, 'run');
            }
            thisPlugin._wrap(newConsumer, 'run', thisPlugin._getConsumerRunPatch.bind(thisPlugin));

            return newConsumer;
        };
    }

    private _getProducerPatch(original: (...args: unknown[]) => Producer) {
        const thisPlugin = this;
        return function (...args: unknown[]): Producer {
            const newProducer: Producer = original.apply(this, arguments);

            if (isWrapped(newProducer.sendBatch)) {
                thisPlugin._unwrap(newProducer, 'sendBatch');
            }
            thisPlugin._wrap(newProducer, 'sendBatch', thisPlugin._getProducerSendBatchPatch.bind(thisPlugin));

            if (isWrapped(newProducer.send)) {
                thisPlugin._unwrap(newProducer, 'send');
            }
            thisPlugin._wrap(newProducer, 'send', thisPlugin._getProducerSendPatch.bind(thisPlugin));

            return newProducer;
        };
    }

    private _getConsumerRunPatch(original: (...args: unknown[]) => Producer) {
        const thisPlugin = this;
        return function (config?: ConsumerRunConfig): Promise<void> {
            if (config?.eachMessage) {
                if (isWrapped(config.eachMessage)) {
                    thisPlugin._unwrap(config, 'eachMessage');
                }
                thisPlugin._wrap(config, 'eachMessage', thisPlugin._getConsumerEachMessagePatch.bind(thisPlugin));
            }
            if (config?.eachBatch) {
                if (isWrapped(config.eachBatch)) {
                    thisPlugin._unwrap(config, 'eachBatch');
                }
                thisPlugin._wrap(config, 'eachBatch', thisPlugin._getConsumerEachBatchPatch.bind(thisPlugin));
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

            const eachMessagePromise = context.with(setSpan(context.active(), span), () => {
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
            return context.with(setSpan(context.active(), receivingSpan), () => {
                const spans = payload.batch.messages.map((message: KafkaMessage) => {
                    const propagatedContext: Context = propagation.extract(
                        ROOT_CONTEXT,
                        message.headers,
                        bufferTextMapGetter
                    );
                    const spanContext = getSpan(propagatedContext)?.context();
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
        const span = this.tracer.startSpan(
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
            safeExecuteInTheMiddle(
                () => this._config.consumerHook!(span, topic, message),
                (e) => {
                    if (e) this.logger.error(`kafkajs instrumentation: consumerHook error`, e);
                },
                true
            );
        }

        return span;
    }

    private _startProducerSpan(topic: string, message: Message) {
        const span = this.tracer.startSpan(topic, {
            kind: SpanKind.PRODUCER,
            attributes: {
                [MessagingAttribute.MESSAGING_SYSTEM]: 'kafka',
                [MessagingAttribute.MESSAGING_DESTINATION]: topic,
                [MessagingAttribute.MESSAGING_DESTINATION_KIND]: 'topic',
            },
        });

        message.headers = message.headers ?? {};
        propagation.inject(setSpan(context.active(), span), message.headers);

        if (this._config?.producerHook) {
            safeExecuteInTheMiddle(
                () => this._config.producerHook!(span, topic, message),
                (e) => {
                    if (e) this.logger.error(`kafkajs instrumentation: producerHook error`, e);
                },
                true
            );
        }

        return span;
    }
}

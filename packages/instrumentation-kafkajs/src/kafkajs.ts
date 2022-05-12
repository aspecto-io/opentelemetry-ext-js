import {
    SpanKind,
    Span,
    SpanStatusCode,
    Context,
    propagation,
    Link,
    trace,
    context,
    diag,
    ROOT_CONTEXT,
} from '@opentelemetry/api';
import {
    SemanticAttributes,
    MessagingOperationValues,
    MessagingDestinationKindValues,
} from '@opentelemetry/semantic-conventions';
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
    InstrumentationModuleDefinition,
    InstrumentationNodeModuleDefinition,
    safeExecuteInTheMiddle,
    isWrapped,
} from '@opentelemetry/instrumentation';

export class KafkaJsInstrumentation extends InstrumentationBase<typeof kafkaJs> {
    static readonly component = 'kafkajs';
    protected override _config!: KafkaJsInstrumentationConfig;
    private moduleVersion: string;

    constructor(config: KafkaJsInstrumentationConfig = {}) {
        super('opentelemetry-instrumentation-kafkajs', VERSION, Object.assign({}, config));
    }

    override setConfig(config: KafkaJsInstrumentationConfig = {}) {
        this._config = Object.assign({}, config);
    }

    protected init(): InstrumentationModuleDefinition<typeof kafkaJs> {
        const module: InstrumentationModuleDefinition<typeof kafkaJs> = new InstrumentationNodeModuleDefinition<
            typeof kafkaJs
        >(KafkaJsInstrumentation.component, ['*'], this.patch.bind(this), this.unpatch.bind(this));
        module.includePrerelease = true;
        return module;
    }

    protected patch(moduleExports: typeof kafkaJs, moduleVersion: string) {
        diag.debug('kafkajs instrumentation: applying patch');
        this.moduleVersion = moduleVersion;

        this.unpatch(moduleExports);
        this._wrap(moduleExports?.Kafka?.prototype, 'producer', this._getProducerPatch.bind(this));
        this._wrap(moduleExports?.Kafka?.prototype, 'consumer', this._getConsumerPatch.bind(this));

        return moduleExports;
    }

    protected unpatch(moduleExports: typeof kafkaJs) {
        diag.debug('kafkajs instrumentation: un-patching');
        if (isWrapped(moduleExports?.Kafka?.prototype.producer)) {
            this._unwrap(moduleExports.Kafka.prototype, 'producer');
        }
        if (isWrapped(moduleExports?.Kafka?.prototype.consumer)) {
            this._unwrap(moduleExports.Kafka.prototype, 'consumer');
        }
    }

    private _getConsumerPatch(original: (...args: unknown[]) => Producer) {
        const self = this;
        return function (...args: unknown[]): Consumer {
            const newConsumer: Consumer = original.apply(this, arguments);

            if (isWrapped(newConsumer.run)) {
                self._unwrap(newConsumer, 'run');
            }
            self._wrap(newConsumer, 'run', self._getConsumerRunPatch.bind(self));

            return newConsumer;
        };
    }

    private _getProducerPatch(original: (...args: unknown[]) => Producer) {
        const self = this;
        return function (...args: unknown[]): Producer {
            const newProducer: Producer = original.apply(this, arguments);

            if (isWrapped(newProducer.sendBatch)) {
                self._unwrap(newProducer, 'sendBatch');
            }
            self._wrap(newProducer, 'sendBatch', self._getProducerSendBatchPatch.bind(self));

            if (isWrapped(newProducer.send)) {
                self._unwrap(newProducer, 'send');
            }
            self._wrap(newProducer, 'send', self._getProducerSendPatch.bind(self));

            return newProducer;
        };
    }

    private _getConsumerRunPatch(original: (...args: unknown[]) => Producer) {
        const self = this;
        return function (config?: ConsumerRunConfig): Promise<void> {
            if (config?.eachMessage) {
                if (isWrapped(config.eachMessage)) {
                    self._unwrap(config, 'eachMessage');
                }
                self._wrap(config, 'eachMessage', self._getConsumerEachMessagePatch.bind(self));
            }
            if (config?.eachBatch) {
                if (isWrapped(config.eachBatch)) {
                    self._unwrap(config, 'eachBatch');
                }
                self._wrap(config, 'eachBatch', self._getConsumerEachBatchPatch.bind(self));
            }
            return original.call(this, config);
        };
    }

    private _getConsumerEachMessagePatch(original: (...args: unknown[]) => Promise<void>) {
        const self = this;
        return function (payload: EachMessagePayload): Promise<void> {
            const propagatedContext: Context = propagation.extract(
                ROOT_CONTEXT,
                payload.message.headers,
                bufferTextMapGetter
            );
            const span = self._startConsumerSpan(
                payload.topic,
                payload.message,
                MessagingOperationValues.PROCESS,
                propagatedContext
            );

            const eachMessagePromise = context.with(trace.setSpan(propagatedContext, span), () => {
                return original.apply(this, arguments);
            });
            return self._endSpansOnPromise([span], eachMessagePromise);
        };
    }

    private _getConsumerEachBatchPatch(original: (...args: unknown[]) => Promise<void>) {
        const self = this;
        return function (payload: EachBatchPayload): Promise<void> {
            // https://github.com/open-telemetry/opentelemetry-specification/blob/master/specification/trace/semantic_conventions/messaging.md#topic-with-multiple-consumers
            const receivingSpan = self._startConsumerSpan(
                payload.batch.topic,
                undefined,
                MessagingOperationValues.RECEIVE,
                ROOT_CONTEXT
            );
            return context.with(trace.setSpan(context.active(), receivingSpan), () => {
                const spans = payload.batch.messages.map((message: KafkaMessage) => {
                    const propagatedContext: Context = propagation.extract(
                        ROOT_CONTEXT,
                        message.headers,
                        bufferTextMapGetter
                    );
                    const spanContext = trace.getSpan(propagatedContext)?.spanContext();
                    let origSpanLink: Link;
                    if (spanContext) {
                        origSpanLink = {
                            context: spanContext,
                        };
                    }
                    return self._startConsumerSpan(
                        payload.batch.topic,
                        message,
                        MessagingOperationValues.PROCESS,
                        undefined,
                        origSpanLink
                    );
                });
                const batchMessagePromise: Promise<void> = original.apply(this, arguments);
                spans.unshift(receivingSpan);
                return self._endSpansOnPromise(spans, batchMessagePromise);
            });
        };
    }

    private _getProducerSendBatchPatch(original: (batch: ProducerBatch) => Promise<RecordMetadata[]>) {
        const self = this;
        return function (batch: ProducerBatch): Promise<RecordMetadata[]> {
            const spans: Span[] = batch.topicMessages
                .map((topicMessage) =>
                    topicMessage.messages.map((message) => self._startProducerSpan(topicMessage.topic, message))
                )
                .reduce((acc, val) => acc.concat(val), []);

            const origSendResult: Promise<RecordMetadata[]> = original.apply(this, arguments);
            return self._endSpansOnPromise(spans, origSendResult);
        };
    }

    private _getProducerSendPatch(original: (record: ProducerRecord) => Promise<RecordMetadata[]>) {
        const self = this;
        return function (record: ProducerRecord): Promise<RecordMetadata[]> {
            const spans: Span[] = record.messages.map((message) => {
                return self._startProducerSpan(record.topic, message);
            });

            const origSendResult: Promise<RecordMetadata[]> = original.apply(this, arguments);
            return self._endSpansOnPromise(spans, origSendResult);
        };
    }

    private _endSpansOnPromise<T>(spans: Span[], sendPromise: Promise<T>): Promise<T> {
        return Promise.resolve(sendPromise)
            .catch((reason) => {
                let errorMessage;
                if (typeof reason === 'string') errorMessage = reason;
                else if (typeof reason === 'object' && reason.hasOwnProperty('message')) errorMessage = reason.message;

                spans.forEach((span) =>
                    span.setStatus({
                        code: SpanStatusCode.ERROR,
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
                    [SemanticAttributes.MESSAGING_SYSTEM]: 'kafka',
                    [SemanticAttributes.MESSAGING_DESTINATION]: topic,
                    [SemanticAttributes.MESSAGING_DESTINATION_KIND]: MessagingDestinationKindValues.TOPIC,
                    [SemanticAttributes.MESSAGING_OPERATION]: operation,
                },
                links: link ? [link] : [],
            },
            context
        );

        if (this._config.moduleVersionAttributeName) {
            span.setAttribute(this._config.moduleVersionAttributeName, this.moduleVersion);
        }

        if (this._config?.consumerHook && message) {
            safeExecuteInTheMiddle(
                () => this._config.consumerHook!(span, topic, message),
                (e: Error) => {
                    if (e) diag.error(`kafkajs instrumentation: consumerHook error`, e);
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
                [SemanticAttributes.MESSAGING_SYSTEM]: 'kafka',
                [SemanticAttributes.MESSAGING_DESTINATION]: topic,
                [SemanticAttributes.MESSAGING_DESTINATION_KIND]: MessagingDestinationKindValues.TOPIC,
            },
        });

        if (this._config.moduleVersionAttributeName) {
            span.setAttribute(this._config.moduleVersionAttributeName, this.moduleVersion);
        }

        message.headers = message.headers ?? {};
        propagation.inject(trace.setSpan(context.active(), span), message.headers);

        if (this._config?.producerHook) {
            safeExecuteInTheMiddle(
                () => this._config.producerHook!(span, topic, message),
                (e: Error) => {
                    if (e) diag.error(`kafkajs instrumentation: producerHook error`, e);
                },
                true
            );
        }

        return span;
    }
}

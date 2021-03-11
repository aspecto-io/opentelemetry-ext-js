import { context, diag, propagation, setSpan, Span, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import {
    InstrumentationBase,
    InstrumentationModuleDefinition,
    InstrumentationNodeModuleDefinition,
    InstrumentationNodeModuleFile,
    safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import { MessagingAttribute, MessagingOperationName } from '@opentelemetry/semantic-conventions';
import type amqp from 'amqplib';
import { AmqplibInstrumentationConfig, EndOperation } from './types';
import {
    CHANNEL_SPANS_NOT_ENDED,
    CONNECTION_ATTRIBUTES,
    getConnectionAttributesFromUrl,
    MESSAGE_STORED_SPAN,
    normalizeExchange,
} from './utils';
import { VERSION } from './version';

export class AmqplibInstrumentation extends InstrumentationBase<typeof amqp> {
    protected _config: AmqplibInstrumentationConfig;

    constructor(config: AmqplibInstrumentationConfig = {}) {
        super('opentelemetry-instrumentation-amqplib', VERSION, Object.assign({}, config));
    }

    setConfig(config: AmqplibInstrumentationConfig = {}) {
        this._config = Object.assign({}, config);
    }

    protected init(): InstrumentationModuleDefinition<typeof amqp> {
        const channelModelModuleFile = new InstrumentationNodeModuleFile<amqp.Channel>(
            `amqplib/lib/channel_model.js`,
            ['>=0.5.5'],
            this.patchChannelModel.bind(this),
            this.unpatchChannelModel.bind(this)
        );

        const connectModuleFile = new InstrumentationNodeModuleFile<amqp.Channel>(
            `amqplib/lib/connect.js`,
            ['>=0.5.5'],
            this.patchConnect.bind(this),
            this.unpatchConnect.bind(this)
        );

        const module = new InstrumentationNodeModuleDefinition<typeof amqp>('amqplib', ['>=0.5.5'], undefined, undefined, [
            channelModelModuleFile,
            connectModuleFile,
        ]);
        return module;
    }

    private patchConnect(moduleExports: any) {
        this._wrap(moduleExports, 'connect', this._getConnectPatch.bind(this));
        return moduleExports;
    }

    private unpatchConnect(moduleExports: any) {
        this._unwrap(moduleExports, 'connect');
        return moduleExports;
    }

    private patchChannelModel(moduleExports: any, moduleVersion: string) {
        this._wrap(moduleExports.Channel.prototype, 'publish', this._getPublishPromisePatch.bind(this, moduleVersion));
        this._wrap(moduleExports.Channel.prototype, 'consume', this._getConsumePromisePatch.bind(this, moduleVersion));
        this._wrap(moduleExports.Channel.prototype, 'ack', this._getAckPromisePatch.bind(this, false, EndOperation.Ack));
        this._wrap(moduleExports.Channel.prototype, 'nack', this._getAckPromisePatch.bind(this, true, EndOperation.Nack));
        this._wrap(moduleExports.Channel.prototype, 'reject', this._getAckPromisePatch.bind(this, true, EndOperation.Reject));
        this._wrap(moduleExports.Channel.prototype, 'ackAll', this._getAckAllPromisePatch.bind(this, false, EndOperation.AckAll));
        this._wrap(moduleExports.Channel.prototype, 'nackAll', this._getAckAllPromisePatch.bind(this, true, EndOperation.NackAll));
        this._wrap(moduleExports.Channel.prototype, 'emit', this._getChannelEmitPatch.bind(this));
        return moduleExports;
    }

    private unpatchChannelModel(moduleExports: any) {
        this._unwrap(moduleExports.Channel.prototype, 'publish');
        this._unwrap(moduleExports.Channel.prototype, 'consume');
        this._unwrap(moduleExports.Channel.prototype, 'ack');
        this._unwrap(moduleExports.Channel.prototype, 'nack');
        this._unwrap(moduleExports.Channel.prototype, 'reject');
        this._unwrap(moduleExports.Channel.prototype, 'ackAll');
        this._unwrap(moduleExports.Channel.prototype, 'nackAll');
        this._unwrap(moduleExports.Channel.prototype, 'emit');
        return moduleExports;
    }

    private _getConnectPatch(original: (url: string | amqp.Options.Connect, socketOptions, openCallback) => amqp.Connection) {
        return function patchedConnect(url: string | amqp.Options.Connect, socketOptions, openCallback) {
            return original.call(this, url, socketOptions, function (err, conn: amqp.Connection) {
                if (err === null) {
                    Object.defineProperty(conn, CONNECTION_ATTRIBUTES, {
                        value: getConnectionAttributesFromUrl(url, conn),
                        enumerable: false,
                    });
                }
                openCallback.apply(this, arguments);
            });
        }
    }

    private _getChannelEmitPatch(original: (eventName: string, ...args: unknown[]) => void) {
        const self = this;
        return function emit(eventName: string) {
            if (eventName === 'close') {
                self.endAllSpansOnChannel(this, true, EndOperation.ChannelClosed);
            } else if (eventName === 'error') {
                self.endAllSpansOnChannel(this, true, EndOperation.ChannelError);
            }
            return original.apply(this, arguments);
        };
    }

    private _getAckAllPromisePatch(isRejected: boolean, endOperation: EndOperation, original: () => void) {
        const self = this;
        return function ackAll(): void {
            self.endAllSpansOnChannel(this, isRejected, endOperation);
            return original.apply(this, arguments);
        };
    }

    private _getAckPromisePatch(
        isRejected: boolean,
        endOperation: EndOperation,
        original: (message: amqp.Message, allUpTo?: boolean, requeue?: boolean) => void
    ) {
        const self = this;
        return function ack(message: amqp.Message, allUpTo?: boolean, requeue?: boolean): void {
            const channel = this;
            // we use this patch in reject function as well, but it has different signature
            const requeueResolved = endOperation === EndOperation.Reject ? allUpTo : requeue;

            const spansNotEnded: amqp.Message[] = channel[CHANNEL_SPANS_NOT_ENDED] ?? [];
            const msgIndex = spansNotEnded.findIndex((m) => m === message);
            if (msgIndex < 0) {
                // should not happen in happy flow
                // but possible if user is calling the api function ack twice with same message
                self.endConsumerSpan(message, isRejected, endOperation, requeueResolved);
            } else if (endOperation !== EndOperation.Reject && allUpTo) {
                for (let i = 0; i <= msgIndex; i++) {
                    self.endConsumerSpan(spansNotEnded[i], isRejected, endOperation, requeueResolved);
                }
                spansNotEnded.splice(0, msgIndex + 1);
            } else {
                self.endConsumerSpan(message, isRejected, endOperation, requeueResolved);
                spansNotEnded.splice(msgIndex, 1);
            }
            return original.apply(this, arguments);
        };
    }

    private _getConsumePromisePatch(
        moduleVersion: string,
        original: (
            queue: string,
            onMessage: (msg: amqp.ConsumeMessage | null) => void,
            options?: amqp.Options.Consume
        ) => Promise<amqp.Replies.Consume>
    ) {
        const self = this;
        return function consume(
            queue: string,
            onMessage: (msg: amqp.ConsumeMessage | null) => void,
            options?: amqp.Options.Consume
        ): Promise<amqp.Replies.Consume> {
            const channel = this;
            if (!channel.hasOwnProperty(CHANNEL_SPANS_NOT_ENDED)) {
                Object.defineProperty(channel, CHANNEL_SPANS_NOT_ENDED, {
                    value: [],
                    enumerable: false,
                    configurable: true,
                });
            }

            const patchedOnMessage = function (msg: amqp.ConsumeMessage | null) {
                const headers = msg.properties.headers;
                const parentContext = propagation.extract(context.active(), headers);
                const exchange = msg?.fields?.exchange;
                const span = self.tracer.startSpan(
                    `${queue} process`,
                    {
                        kind: SpanKind.CONSUMER,
                        attributes: {
                            ...channel?.connection?.[CONNECTION_ATTRIBUTES],
                            [MessagingAttribute.MESSAGING_DESTINATION]: exchange,
                            [MessagingAttribute.MESSAGING_DESTINATION_KIND]: exchange ? 'topic' : 'queue',
                            [MessagingAttribute.MESSAGING_RABBITMQ_ROUTING_KEY]: msg?.fields?.routingKey,
                            [MessagingAttribute.MESSAGING_OPERATION]: MessagingOperationName.PROCESS,
                        },
                    },
                    parentContext
                );

                if (self._config.moduleVersionAttributeName) {
                    span.setAttribute(self._config.moduleVersionAttributeName, moduleVersion);
                }

                if (self._config.consumerHook) {
                    safeExecuteInTheMiddle(
                        () => self._config.consumerHook(span, msg),
                        (e) => {
                            if (e) {
                                diag.error('amqplib instrumentation: consumerHook error', e);
                            }
                        },
                        true
                    );
                }

                if (!options?.noAck) {
                    // store the message on the channel so we can close the span on ackAll etc
                    channel[CHANNEL_SPANS_NOT_ENDED].push(msg);

                    // store the span on the message, so we can end it when user call 'ack' on it
                    Object.defineProperty(msg, MESSAGE_STORED_SPAN, {
                        value: span,
                        enumerable: false,
                        configurable: true,
                    });
                }

                context.with(setSpan(context.active(), span), () => {
                    onMessage.call(this, msg);
                });

                if (options?.noAck) {
                    self.callConsumeEndHook(span, msg, false, EndOperation.AutoAck);
                    span.end();
                }
            };
            return original.call(this, queue, patchedOnMessage, options);
        };
    }

    private _getPublishPromisePatch(
        moduleVersion: string,
        original: (exchange: string, routingKey: string, content: Buffer, options?: amqp.Options.Publish) => boolean
    ) {
        const self = this;
        return function publish(
            exchange: string,
            routingKey: string,
            content: Buffer,
            options?: amqp.Options.Publish
        ): boolean {
            const normalizedExchange = normalizeExchange(exchange);
            const span = self.tracer.startSpan(`${normalizedExchange} -> ${routingKey} send`, {
                kind: SpanKind.PRODUCER,
                attributes: {
                    ...this.connection[CONNECTION_ATTRIBUTES],
                    [MessagingAttribute.MESSAGING_DESTINATION]: exchange,
                    [MessagingAttribute.MESSAGING_DESTINATION_KIND]: exchange ? 'topic' : 'queue',
                    [MessagingAttribute.MESSAGING_RABBITMQ_ROUTING_KEY]: routingKey,
                },
            });

            if (self._config.moduleVersionAttributeName) {
                span.setAttribute(self._config.moduleVersionAttributeName, moduleVersion);
            }

            const modifiedOptions = options ?? {};
            modifiedOptions.headers = modifiedOptions.headers ?? {};
            propagation.inject(setSpan(context.active(), span), modifiedOptions.headers);

            if (self._config.publishHook) {
                safeExecuteInTheMiddle(
                    () => self._config.publishHook(span, { exchange, routingKey, content, options }),
                    (e) => {
                        if (e) {
                            diag.error('amqplib instrumentation: publishHook error', e);
                        }
                    },
                    true
                );
            }

            // calling original publish function is only storing the message in queue.
            // it does not send it and waits for an ack, so the span duration is expected to be very short.
            const originalRes = original.call(this, exchange, routingKey, content, modifiedOptions);
            if (!originalRes) {
                span.setStatus({
                    code: SpanStatusCode.ERROR,
                    message: 'write buffer is full, message should be published again after drain event',
                });
            }
            span.end();
            return originalRes;
        };
    }

    private endConsumerSpan(
        message: amqp.Message,
        isRejected: boolean,
        operation: EndOperation,
        requeue: boolean
    ) {
        const storedSpan: Span = message[MESSAGE_STORED_SPAN];
        if (!storedSpan) return;
        if (isRejected) {
            storedSpan.setStatus({
                code: SpanStatusCode.ERROR,
                message:
                    operation !== EndOperation.ChannelClosed && operation !== EndOperation.ChannelError
                        ? `${operation} called on message ${requeue ? 'with' : 'without'} requeue`
                        : operation,
            });
        }
        this.callConsumeEndHook(storedSpan, message, isRejected, operation);
        storedSpan.end();
        delete message[MESSAGE_STORED_SPAN];
    };
    
    private endAllSpansOnChannel(channel: amqp.Channel[], isRejected: boolean, operation: EndOperation) {
        const spansNotEnded: amqp.Message[] = channel[CHANNEL_SPANS_NOT_ENDED] ?? [];
        spansNotEnded.forEach((message) => {
            this.endConsumerSpan(message, isRejected, operation, null);
        });
        Object.defineProperty(channel, CHANNEL_SPANS_NOT_ENDED, {
            value: [],
            enumerable: false,
            configurable: true,
        });
    };

    private callConsumeEndHook(
        span: Span,
        msg: amqp.ConsumeMessage | null,
        rejected: boolean,
        endOperation: EndOperation
    ) {
        if (!this._config.consumerEndHook) return;
    
        safeExecuteInTheMiddle(
            () => this._config.consumerEndHook(span, msg, rejected, endOperation),
            (e) => {
                if (e) {
                    diag.error('amqplib instrumentation: consumerEndHook error', e);
                }
            },
            true
        );
    };    
    
    
}

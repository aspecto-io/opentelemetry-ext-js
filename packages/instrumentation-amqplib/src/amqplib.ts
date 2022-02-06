import { context, diag, propagation, trace, Span, SpanKind, SpanStatusCode, Link } from '@opentelemetry/api';
import {
    InstrumentationBase,
    InstrumentationModuleDefinition,
    InstrumentationNodeModuleDefinition,
    InstrumentationNodeModuleFile,
    isWrapped,
    safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import {
    SemanticAttributes,
    MessagingOperationValues,
    MessagingDestinationKindValues,
} from '@opentelemetry/semantic-conventions';
import type amqp from 'amqplib';
import { AmqplibInstrumentationConfig, DEFAULT_CONFIG, EndOperation } from './types';
import {
    CHANNEL_CONSUME_TIMEOUT_TIMER,
    CHANNEL_MESSAGES_NOT_SETTLED,
    CONNECTION_ATTRIBUTES,
    extractConsumerMessageAttributes,
    getConnectionAttributesFromUrl,
    getSettlementLinks,
    isConfirmChannelTracing,
    markConfirmChannelTracing,
    MESSAGE_SETTLE_INFO,
    MsgInfoForSettlement,
    normalizeExchange,
    unmarkConfirmChannelTracing,
} from './utils';
import { VERSION } from './version';

export class AmqplibInstrumentation extends InstrumentationBase<typeof amqp> {
    protected override _config: AmqplibInstrumentationConfig;

    constructor(config: AmqplibInstrumentationConfig = {}) {
        super('opentelemetry-instrumentation-amqplib', VERSION, Object.assign({}, DEFAULT_CONFIG, config));
    }

    override setConfig(config: AmqplibInstrumentationConfig = {}) {
        this._config = Object.assign({}, DEFAULT_CONFIG, config);
    }

    protected init(): InstrumentationModuleDefinition<typeof amqp> {
        const channelModelModuleFile = new InstrumentationNodeModuleFile<amqp.Channel>(
            `amqplib/lib/channel_model.js`,
            ['>=0.5.5'],
            this.patchChannelModel.bind(this),
            this.unpatchChannelModel.bind(this)
        );

        const callbackModelModuleFile = new InstrumentationNodeModuleFile<amqp.Channel>(
            `amqplib/lib/callback_model.js`,
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

        const module = new InstrumentationNodeModuleDefinition<typeof amqp>(
            'amqplib',
            ['>=0.5.5'],
            undefined,
            undefined,
            [channelModelModuleFile, connectModuleFile, callbackModelModuleFile]
        );
        return module;
    }

    private patchConnect(moduleExports: any) {
        moduleExports = this.unpatchConnect(moduleExports);
        if (!isWrapped(moduleExports.connect)) {
            this._wrap(moduleExports, 'connect', this.getConnectPatch.bind(this));
        }
        return moduleExports;
    }

    private unpatchConnect(moduleExports: any) {
        if (isWrapped(moduleExports.connect)) {
            this._unwrap(moduleExports, 'connect');
        }
        return moduleExports;
    }

    private patchChannelModel(moduleExports: any, moduleVersion: string) {
        if (!isWrapped(moduleExports.Channel.prototype.publish)) {
            this._wrap(moduleExports.Channel.prototype, 'publish', this.getPublishPatch.bind(this, moduleVersion));
        }
        if (!isWrapped(moduleExports.Channel.prototype.consume)) {
            this._wrap(moduleExports.Channel.prototype, 'consume', this.getConsumePatch.bind(this, moduleVersion));
        }
        if (!isWrapped(moduleExports.Channel.prototype.ack)) {
            this._wrap(moduleExports.Channel.prototype, 'ack', this.getAckPatch.bind(this, false, EndOperation.Ack));
        }
        if (!isWrapped(moduleExports.Channel.prototype.nack)) {
            this._wrap(moduleExports.Channel.prototype, 'nack', this.getAckPatch.bind(this, true, EndOperation.Nack));
        }
        if (!isWrapped(moduleExports.Channel.prototype.reject)) {
            this._wrap(
                moduleExports.Channel.prototype,
                'reject',
                this.getAckPatch.bind(this, true, EndOperation.Reject)
            );
        }
        if (!isWrapped(moduleExports.Channel.prototype.ackAll)) {
            this._wrap(
                moduleExports.Channel.prototype,
                'ackAll',
                this.getAckAllPatch.bind(this, false, EndOperation.AckAll)
            );
        }
        if (!isWrapped(moduleExports.Channel.prototype.nackAll)) {
            this._wrap(
                moduleExports.Channel.prototype,
                'nackAll',
                this.getAckAllPatch.bind(this, true, EndOperation.NackAll)
            );
        }
        if (!isWrapped(moduleExports.Channel.prototype.emit)) {
            this._wrap(moduleExports.Channel.prototype, 'emit', this.getChannelEmitPatch.bind(this));
        }
        if (!isWrapped(moduleExports.ConfirmChannel.prototype.publish)) {
            this._wrap(
                moduleExports.ConfirmChannel.prototype,
                'publish',
                this.getConfirmedPublishPatch.bind(this, moduleVersion)
            );
        }
        return moduleExports;
    }

    private unpatchChannelModel(moduleExports: any) {
        if (isWrapped(moduleExports.Channel.prototype.publish)) {
            this._unwrap(moduleExports.Channel.prototype, 'publish');
        }
        if (isWrapped(moduleExports.Channel.prototype.consume)) {
            this._unwrap(moduleExports.Channel.prototype, 'consume');
        }
        if (isWrapped(moduleExports.Channel.prototype.ack)) {
            this._unwrap(moduleExports.Channel.prototype, 'ack');
        }
        if (isWrapped(moduleExports.Channel.prototype.nack)) {
            this._unwrap(moduleExports.Channel.prototype, 'nack');
        }
        if (isWrapped(moduleExports.Channel.prototype.reject)) {
            this._unwrap(moduleExports.Channel.prototype, 'reject');
        }
        if (isWrapped(moduleExports.Channel.prototype.ackAll)) {
            this._unwrap(moduleExports.Channel.prototype, 'ackAll');
        }
        if (isWrapped(moduleExports.Channel.prototype.nackAll)) {
            this._unwrap(moduleExports.Channel.prototype, 'nackAll');
        }
        if (isWrapped(moduleExports.Channel.prototype.emit)) {
            this._unwrap(moduleExports.Channel.prototype, 'emit');
        }
        if (isWrapped(moduleExports.ConfirmChannel.prototype.publish)) {
            this._unwrap(moduleExports.ConfirmChannel.prototype, 'publish');
        }
        return moduleExports;
    }

    private getConnectPatch(
        original: (url: string | amqp.Options.Connect, socketOptions, openCallback) => amqp.Connection
    ) {
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
        };
    }

    private getChannelEmitPatch(original: (eventName: string, ...args: unknown[]) => void) {
        const self = this;
        return function emit(eventName: string) {
            let endOperation: string | undefined;
            let links: Link[] | undefined;
            if (eventName === 'close') {
                endOperation = EndOperation.ChannelClosed;
                links = self.settleAllSpansOnChannel(this);
                const activeTimer = this[CHANNEL_CONSUME_TIMEOUT_TIMER];
                if (activeTimer) {
                    clearInterval(activeTimer);
                }
                delete this[CHANNEL_CONSUME_TIMEOUT_TIMER];
            } else if (eventName === 'error') {
                endOperation = EndOperation.ChannelError;
                links = self.settleAllSpansOnChannel(this);
            }

            if (endOperation) {
                return self.tracer.startActiveSpan(
                    endOperation,
                    {
                        kind: SpanKind.CLIENT,
                        attributes: {
                            [SemanticAttributes.MESSAGING_OPERATION]: 'settle',
                        },
                        links,
                    },
                    (span) => {
                        span.setStatus({
                            code: SpanStatusCode.ERROR,
                            message: endOperation,
                        });
                        const res = original.apply(this, arguments);
                        span.end();
                        return res;
                    }
                );
            } else {
                return original.apply(this, arguments);
            }
        };
    }

    private getAckAllPatch(isRejected: boolean, endOperation: EndOperation, original: () => void) {
        const self = this;
        return function ackAll(): void {
            const links = self.settleAllSpansOnChannel(this);
            return self.tracer.startActiveSpan(
                endOperation,
                {
                    kind: SpanKind.CLIENT,
                    attributes: {
                        [SemanticAttributes.MESSAGING_OPERATION]: 'settle',
                    },
                    links,
                },
                (span: Span) => {
                    if (isRejected) {
                        span.setStatus({
                            code: SpanStatusCode.ERROR,
                            message: `${endOperation} called on channel with requeue`,
                        });
                    }
                    const res = original.apply(this, arguments);
                    span.end();
                    return res;
                }
            );
        };
    }

    private getAckPatch(
        isRejected: boolean,
        endOperation: EndOperation,
        original: (message: amqp.Message, allUpTo?: boolean, requeue?: boolean) => void
    ) {
        const self = this;
        return function ack(message: amqp.Message, allUpTo?: boolean, requeue?: boolean): void {
            const channel = this;
            // we use this patch in reject function as well, but it has different signature
            const requeueResolved = endOperation === EndOperation.Reject ? allUpTo : requeue;

            let links;
            const messagesNotSettled: MsgInfoForSettlement[] = channel[CHANNEL_MESSAGES_NOT_SETTLED] ?? [];
            const msgIndex = messagesNotSettled.findIndex((msgDetails) => msgDetails.msg === message);
            if (msgIndex < 0) {
                // should not happen in happy flow
                // but possible if user is calling the api function ack twice with same message
                links = getSettlementLinks(message);
            } else if (endOperation !== EndOperation.Reject && allUpTo) {
                const settledMessages = messagesNotSettled.splice(0, msgIndex + 1);
                links = settledMessages.map((info) => getSettlementLinks(info.msg)).flat();
            } else {
                links = getSettlementLinks(message);
                messagesNotSettled.splice(msgIndex, 1);
            }
            return self.tracer.startActiveSpan(
                endOperation,
                {
                    kind: SpanKind.CLIENT,
                    attributes: {
                        [SemanticAttributes.MESSAGING_OPERATION]: 'settle',
                    },
                    links,
                },
                (span: Span) => {
                    if (isRejected) {
                        span.setStatus({
                            code: SpanStatusCode.ERROR,
                            message: `${endOperation} called on message ${requeue ? 'with' : 'without'} requeue`,
                        });
                    }
                    const res = original.apply(this, arguments);
                    span.end();
                    return res;
                }
            );
        };
    }

    protected getConsumePatch(
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
            if (!channel.hasOwnProperty(CHANNEL_MESSAGES_NOT_SETTLED)) {
                if (self._config.consumeTimeoutMs) {
                    const timer = setInterval(() => {
                        self.checkConsumeTimeoutOnChannel(channel);
                    }, self._config.consumeTimeoutMs);
                    timer.unref();
                    Object.defineProperty(channel, CHANNEL_CONSUME_TIMEOUT_TIMER, {
                        value: timer,
                        enumerable: false,
                        configurable: true,
                    });
                }
                Object.defineProperty(channel, CHANNEL_MESSAGES_NOT_SETTLED, {
                    value: [],
                    enumerable: false,
                    configurable: true,
                });
            }

            const patchedOnMessage = function (msg: amqp.ConsumeMessage | null) {
                // msg is expected to be null for signaling consumer cancel notification
                // https://www.rabbitmq.com/consumer-cancel.html
                // in this case, we do not start a span, as this is not a real message.
                if (!msg) {
                    return onMessage.call(this, msg);
                }

                const headers = msg.properties.headers ?? {};
                const senderContext = propagation.extract(context.active(), headers);
                const senderSpanContext = trace.getSpanContext(senderContext);
                const msgAttributes = extractConsumerMessageAttributes(msg);

                const senderLink: Link = {
                    context: senderSpanContext,
                    attributes: msgAttributes,
                };
                const links = [senderLink];

                const span = self.tracer.startSpan(
                    `${queue} deliver`,
                    {
                        kind: SpanKind.CONSUMER,
                        attributes: {
                            ...channel?.connection?.[CONNECTION_ATTRIBUTES],
                            [SemanticAttributes.MESSAGING_DESTINATION]: queue,
                            [SemanticAttributes.MESSAGING_DESTINATION_KIND]: MessagingDestinationKindValues.QUEUE,
                            [SemanticAttributes.MESSAGING_OPERATION]: 'deliver',
                        },
                        links,
                    },
                    context.active()
                );

                if (self._config.moduleVersionAttributeName) {
                    span.setAttribute(self._config.moduleVersionAttributeName, moduleVersion);
                }

                if (self._config.consumeHook) {
                    safeExecuteInTheMiddle(
                        () => self._config.consumeHook(span, msg),
                        (e) => {
                            if (e) {
                                diag.error('amqplib instrumentation: consumerHook error', e);
                            }
                        },
                        true
                    );
                }

                if (!options?.noAck) {
                    const settlementInfo: MsgInfoForSettlement = {
                        deliverContext: span.spanContext(),
                        senderContext: senderSpanContext,
                        msgAttributes,
                        msg,
                        timeOfConsume: new Date(),
                    };
                    // store the message on the channel so we can close the span on ackAll etc
                    channel[CHANNEL_MESSAGES_NOT_SETTLED].push(settlementInfo);

                    // store the span on the message, so we can end it when user call 'ack' on it
                    Object.defineProperty(msg, MESSAGE_SETTLE_INFO, {
                        value: settlementInfo,
                        enumerable: false,
                        configurable: true,
                    });
                }

                const onMessageRes = context.with(trace.setSpan(context.active(), span), onMessage, this, msg);
                // always end the span when the callback returns
                Promise.resolve(onMessageRes).then(() => {
                    span.end();
                });
                return onMessageRes;
            };
            arguments[1] = patchedOnMessage;
            return original.apply(this, arguments);
        };
    }

    protected getConfirmedPublishPatch(
        moduleVersion: string,
        original: (
            exchange: string,
            routingKey: string,
            content: Buffer,
            options?: amqp.Options.Publish,
            callback?: (err: any, ok: amqp.Replies.Empty) => void
        ) => boolean
    ) {
        const self = this;
        return function confirmedPublish(
            exchange: string,
            routingKey: string,
            content: Buffer,
            options?: amqp.Options.Publish,
            callback?: (err: any, ok: amqp.Replies.Empty) => void
        ): boolean {
            const channel = this;
            const { span, modifiedOptions } = self.createPublishSpan(
                self,
                exchange,
                routingKey,
                channel,
                moduleVersion,
                options
            );

            if (self._config.publishHook) {
                safeExecuteInTheMiddle(
                    () =>
                        self._config.publishHook(span, {
                            exchange,
                            routingKey,
                            content,
                            options,
                            isConfirmChannel: true,
                        }),
                    (e) => {
                        if (e) {
                            diag.error('amqplib instrumentation: publishHook error', e);
                        }
                    },
                    true
                );
            }

            const patchedOnConfirm = function (err: any, ok: amqp.Replies.Empty) {
                try {
                    callback?.call(this, err, ok);
                } finally {
                    if (self._config.publishConfirmHook) {
                        safeExecuteInTheMiddle(
                            () =>
                                self._config.publishConfirmHook(
                                    span,
                                    { exchange, routingKey, content, options, isConfirmChannel: true },
                                    err
                                ),
                            (e) => {
                                if (e) {
                                    diag.error('amqplib instrumentation: publishConfirmHook error', e);
                                }
                            },
                            true
                        );
                    }

                    if (err) {
                        span.setStatus({
                            code: SpanStatusCode.ERROR,
                            message: "message confirmation has been nack'ed",
                        });
                    }
                    span.end();
                }
            };

            // calling confirm channel publish function is storing the message in queue and registering the callback for broker confirm.
            // span ends in the patched callback.
            const markedContext = markConfirmChannelTracing(context.active());
            const argumentsCopy = [...arguments];
            argumentsCopy[3] = modifiedOptions;
            argumentsCopy[4] = context.bind(
                unmarkConfirmChannelTracing(trace.setSpan(markedContext, span)),
                patchedOnConfirm
            );
            return context.with(markedContext, original.bind(this, ...argumentsCopy));
        };
    }

    protected getPublishPatch(
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
            if (isConfirmChannelTracing(context.active())) {
                // work already done
                return original.apply(this, arguments);
            } else {
                const channel = this;
                const { span, modifiedOptions } = self.createPublishSpan(
                    self,
                    exchange,
                    routingKey,
                    channel,
                    moduleVersion,
                    options
                );

                if (self._config.publishHook) {
                    safeExecuteInTheMiddle(
                        () =>
                            self._config.publishHook(span, {
                                exchange,
                                routingKey,
                                content,
                                options,
                                isConfirmChannel: false,
                            }),
                        (e) => {
                            if (e) {
                                diag.error('amqplib instrumentation: publishHook error', e);
                            }
                        },
                        true
                    );
                }

                // calling normal channel publish function is only storing the message in queue.
                // it does not send it and waits for an ack, so the span duration is expected to be very short.
                const argumentsCopy = [...arguments];
                argumentsCopy[3] = modifiedOptions;
                const originalRes = original.apply(this, argumentsCopy);
                span.end();
                return originalRes;
            }
        };
    }

    private createPublishSpan(
        self: this,
        exchange: string,
        routingKey: string,
        channel,
        moduleVersion: string,
        options?: amqp.Options.Publish
    ) {
        const normalizedExchange = normalizeExchange(exchange);

        const span = self.tracer.startSpan(`${normalizedExchange} publish`, {
            kind: SpanKind.PRODUCER,
            attributes: {
                ...channel.connection[CONNECTION_ATTRIBUTES],
                [SemanticAttributes.MESSAGING_DESTINATION]: exchange,
                [SemanticAttributes.MESSAGING_DESTINATION_KIND]: MessagingDestinationKindValues.TOPIC,
                [SemanticAttributes.MESSAGING_RABBITMQ_ROUTING_KEY]: routingKey,
                [SemanticAttributes.MESSAGING_MESSAGE_ID]: options?.messageId,
                [SemanticAttributes.MESSAGING_CONVERSATION_ID]: options?.correlationId,
            },
        });
        if (self._config.moduleVersionAttributeName) {
            span.setAttribute(self._config.moduleVersionAttributeName, moduleVersion);
        }
        const modifiedOptions = options ?? {};
        modifiedOptions.headers = modifiedOptions.headers ?? {};

        propagation.inject(trace.setSpan(context.active(), span), modifiedOptions.headers);

        return { span, modifiedOptions };
    }

    private settleAllSpansOnChannel(channel: amqp.Channel): Link[] {
        const msgsNotSettled: MsgInfoForSettlement[] = channel[CHANNEL_MESSAGES_NOT_SETTLED] ?? [];
        const links = msgsNotSettled.map((info) => getSettlementLinks(info.msg)).flat();
        Object.defineProperty(channel, CHANNEL_MESSAGES_NOT_SETTLED, {
            value: [],
            enumerable: false,
            configurable: true,
        });
        return links;
    }

    private checkConsumeTimeoutOnChannel(channel: amqp.Channel) {
        const currentTime = new Date().getTime();
        const spansNotSettled: MsgInfoForSettlement[] = channel[CHANNEL_MESSAGES_NOT_SETTLED] ?? [];
        let i: number;
        for (i = 0; i < spansNotSettled.length; i++) {
            const currMessage = spansNotSettled[i];
            const timeFromConsume = currentTime - currMessage.timeOfConsume.getTime();
            if (timeFromConsume < this._config.consumeTimeoutMs) {
                break;
            }
        }

        // common case - no messages
        if (i === 0) {
            return;
        }

        const timedoutMsgs = spansNotSettled.splice(0, i);
        // TODO: how should we report these messages being timed out?
        // should we create settlement span for them? just not settle them?
    }
}

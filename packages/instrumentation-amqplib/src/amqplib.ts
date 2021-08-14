import { context, diag, propagation, Span, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import {
    InstrumentationBase,
    InstrumentationModuleDefinition,
    InstrumentationNodeModuleDefinition,
    InstrumentationNodeModuleFile,
    isWrapped,
    safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import {
    MessagingDestinationKindValues,
    MessagingOperationValues,
    SemanticAttributes,
} from '@opentelemetry/semantic-conventions';
import type amqp from 'amqplib';
import { AmqplibInstrumentationConfig, DEFAULT_CONFIG, EndOperation } from './types';
import {
    CHANNEL_CONSUME_TIMEOUT_TIMER,
    CHANNEL_SPANS_NOT_ENDED,
    CONNECTION_ATTRIBUTES,
    getConnectionAttributesFromUrl,
    MESSAGE_STORED_SPAN,
    normalizeExchange,
} from './utils';
import { VERSION } from './version';
import { Replies } from 'amqplib/properties';
import { Options } from 'amqplib';

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
            if (eventName === 'close') {
                self.endAllSpansOnChannel(this, true, EndOperation.ChannelClosed);
                const activeTimer = this[CHANNEL_CONSUME_TIMEOUT_TIMER];
                if (activeTimer) {
                    clearInterval(activeTimer);
                }
                delete this[CHANNEL_CONSUME_TIMEOUT_TIMER];
            } else if (eventName === 'error') {
                self.endAllSpansOnChannel(this, true, EndOperation.ChannelError);
            }
            return original.apply(this, arguments);
        };
    }

    private getAckAllPatch(isRejected: boolean, endOperation: EndOperation, original: () => void) {
        const self = this;
        return function ackAll(): void {
            self.endAllSpansOnChannel(this, isRejected, endOperation);
            return original.apply(this, arguments);
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

            const spansNotEnded: { msg: amqp.Message }[] = channel[CHANNEL_SPANS_NOT_ENDED] ?? [];
            const msgIndex = spansNotEnded.findIndex((msgDetails) => msgDetails.msg === message);
            if (msgIndex < 0) {
                // should not happen in happy flow
                // but possible if user is calling the api function ack twice with same message
                self.endConsumerSpan(message, isRejected, endOperation, requeueResolved);
            } else if (endOperation !== EndOperation.Reject && allUpTo) {
                for (let i = 0; i <= msgIndex; i++) {
                    self.endConsumerSpan(spansNotEnded[i].msg, isRejected, endOperation, requeueResolved);
                }
                spansNotEnded.splice(0, msgIndex + 1);
            } else {
                self.endConsumerSpan(message, isRejected, endOperation, requeueResolved);
                spansNotEnded.splice(msgIndex, 1);
            }
            return original.apply(this, arguments);
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
            if (!channel.hasOwnProperty(CHANNEL_SPANS_NOT_ENDED)) {
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
                            [SemanticAttributes.MESSAGING_DESTINATION]: exchange,
                            [SemanticAttributes.MESSAGING_DESTINATION_KIND]: MessagingDestinationKindValues.QUEUE,
                            [SemanticAttributes.MESSAGING_RABBITMQ_ROUTING_KEY]: msg?.fields?.routingKey,
                            [SemanticAttributes.MESSAGING_OPERATION]: MessagingOperationValues.PROCESS,
                            [SemanticAttributes.MESSAGING_MESSAGE_ID]: msg?.properties.messageId,
                            [SemanticAttributes.MESSAGING_CONVERSATION_ID]: msg?.properties.correlationId,
                        },
                    },
                    parentContext
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
                    // store the message on the channel so we can close the span on ackAll etc
                    channel[CHANNEL_SPANS_NOT_ENDED].push({ msg, timeOfConsume: new Date() });

                    // store the span on the message, so we can end it when user call 'ack' on it
                    Object.defineProperty(msg, MESSAGE_STORED_SPAN, {
                        value: span,
                        enumerable: false,
                        configurable: true,
                    });
                }

                context.with(trace.setSpan(context.active(), span), () => {
                    onMessage.call(this, msg);
                });

                if (options?.noAck) {
                    self.callConsumeEndHook(span, msg, false, EndOperation.AutoAck);
                    span.setStatus({ code: SpanStatusCode.OK });
                    span.end();
                }
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
            callback?: (err: any, ok: Replies.Empty) => void
        ) => boolean
    ) {
        const self = this;
        return function confirmedPublish(
            exchange: string,
            routingKey: string,
            content: Buffer,
            options?: amqp.Options.Publish,
            callback?: (err: any, ok: Replies.Empty) => void
        ): boolean {
            const channel = this;
            const { span, modifiedOptions } = self.createPublishSpan(
                exchange,
                self,
                routingKey,
                channel,
                moduleVersion,
                options
            );

            if (self._config.publishConfirmHook) {
                safeExecuteInTheMiddle(
                    () => self._config.publishConfirmHook(span, { exchange, routingKey, content, options }),
                    (e) => {
                        if (e) {
                            diag.error('amqplib instrumentation: publishConfirmHook error', e);
                        }
                    },
                    true
                );
            }

            const patchedOnConfirm = function (err: any, ok: Replies.Empty) {
                // should we wrap with context and end span after this callback or end span right away?
                context.with(trace.setSpan(context.active(), span), () => {
                    callback?.call(this, err, ok);
                });

                if (self._config.publishConfirmEndHook) {
                    safeExecuteInTheMiddle(
                        () => self._config.publishConfirmEndHook(span, { exchange, routingKey, content, options }, err),
                        (e) => {
                            if (e) {
                                diag.error('amqplib instrumentation: publishConfirmEndHook error', e);
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
                } else {
                    span.setStatus({ code: SpanStatusCode.OK });
                }
                span.end();
            };

            // calling confirm channel publish function is storing the message in queue and registering the callback for broker confirm.
            // span ends in the patched callback.
            const argumentsCopy = [...arguments];
            argumentsCopy[3] = modifiedOptions;
            argumentsCopy[4] = patchedOnConfirm;
            return original.apply(this, argumentsCopy);
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
            const isConfirmChannel = !!this.waitForConfirms; // duck typing, can we reliably check for CC in a cleaner way?
            if (isConfirmChannel) {
                // work already done
                return original.apply(this, arguments);
            } else {
                const channel = this;
                const { span, modifiedOptions } = self.createPublishSpan(
                    exchange,
                    self,
                    routingKey,
                    channel,
                    moduleVersion,
                    options
                );

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

                // calling normal channel publish function is only storing the message in queue.
                // it does not send it and waits for an ack, so the span duration is expected to be very short.
                const argumentsCopy = [...arguments];
                argumentsCopy[3] = modifiedOptions;
                const originalRes = original.apply(this, argumentsCopy);
                span.setStatus({ code: SpanStatusCode.OK });
                span.end();
                return originalRes;
            }
        };
    }

    private createPublishSpan(
        exchange: string,
        self: this,
        routingKey: string,
        channel,
        moduleVersion: string,
        options?: Options.Publish
    ) {
        const normalizedExchange = normalizeExchange(exchange);

        const span = self.tracer.startSpan(`${normalizedExchange} -> ${routingKey} send`, {
            kind: SpanKind.PRODUCER,
            attributes: {
                ...channel.connection[CONNECTION_ATTRIBUTES],
                [SemanticAttributes.MESSAGING_DESTINATION]: exchange,
                [SemanticAttributes.MESSAGING_DESTINATION_KIND]: MessagingDestinationKindValues.QUEUE,
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

    private endConsumerSpan(message: amqp.Message, isRejected: boolean, operation: EndOperation, requeue: boolean) {
        const storedSpan: Span = message[MESSAGE_STORED_SPAN];
        if (!storedSpan) return;
        if (isRejected !== false) {
            storedSpan.setStatus({
                code: SpanStatusCode.ERROR,
                message:
                    operation !== EndOperation.ChannelClosed && operation !== EndOperation.ChannelError
                        ? `${operation} called on message ${requeue ? 'with' : 'without'} requeue`
                        : operation,
            });
        } else {
            storedSpan.setStatus({ code: SpanStatusCode.OK });
        }
        this.callConsumeEndHook(storedSpan, message, isRejected, operation);
        storedSpan.end();
        delete message[MESSAGE_STORED_SPAN];
    }

    private endAllSpansOnChannel(channel: amqp.Channel, isRejected: boolean, operation: EndOperation) {
        const spansNotEnded: { msg: amqp.Message }[] = channel[CHANNEL_SPANS_NOT_ENDED] ?? [];
        spansNotEnded.forEach((msgDetails) => {
            this.endConsumerSpan(msgDetails.msg, isRejected, operation, null);
        });
        Object.defineProperty(channel, CHANNEL_SPANS_NOT_ENDED, {
            value: [],
            enumerable: false,
            configurable: true,
        });
    }

    private callConsumeEndHook(
        span: Span,
        msg: amqp.ConsumeMessage | null,
        rejected: boolean,
        endOperation: EndOperation
    ) {
        if (!this._config.consumeEndHook) return;

        safeExecuteInTheMiddle(
            () => this._config.consumeEndHook(span, msg, rejected, endOperation),
            (e) => {
                if (e) {
                    diag.error('amqplib instrumentation: consumerEndHook error', e);
                }
            },
            true
        );
    }

    private checkConsumeTimeoutOnChannel(channel: amqp.Channel) {
        const currentTime = new Date().getTime();
        const spansNotEnded: { msg: amqp.Message; timeOfConsume: Date }[] = channel[CHANNEL_SPANS_NOT_ENDED] ?? [];
        let i: number;
        for (i = 0; i < spansNotEnded.length; i++) {
            const currMessage = spansNotEnded[i];
            const timeFromConsume = currentTime - currMessage.timeOfConsume.getTime();
            if (timeFromConsume < this._config.consumeTimeoutMs) {
                break;
            }
            this.endConsumerSpan(currMessage.msg, null, EndOperation.InstrumentationTimeout, true);
        }
        spansNotEnded.splice(0, i);
    }
}

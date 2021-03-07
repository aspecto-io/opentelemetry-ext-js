import { Span, SpanStatusCode } from '@opentelemetry/api';
import type amqp from 'amqplib';

export const MESSAGE_STORED_SPAN: unique symbol = Symbol('opentelemetry.amqplib.message.stored-span');
export const CHANNEL_SPANS_NOT_ENDED: unique symbol = Symbol('opentelemetry.amqplib.channel.spans-not-ended');

export const normalizeExchange = (exchangeName: string) => (exchangeName !== '' ? exchangeName : '<default>');

export const endConsumerSpan = (message: amqp.Message, isRejected: boolean, requeue?: boolean) => {
    const storedSpan: Span = message[MESSAGE_STORED_SPAN];
    if (!storedSpan) return;
    if (isRejected) {
        storedSpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: `${'nack'} called on message ${requeue ? 'with' : 'without'} requeue`,
        });
    }
    storedSpan.end();
    delete message[MESSAGE_STORED_SPAN];
};

export const endAllSpansOnChannel = (channel: amqp.Channel[], isRejected: boolean) => {
    const spansNotEnded: amqp.Message[] = channel[CHANNEL_SPANS_NOT_ENDED] ?? [];
    spansNotEnded.forEach(message => {
        endConsumerSpan(message, isRejected, null);
    });
    Object.defineProperty(channel, CHANNEL_SPANS_NOT_ENDED, {
        value: [],
        enumerable: false,
        configurable: true,
    });
}
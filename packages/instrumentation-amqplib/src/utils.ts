import { SpanAttributes } from '@opentelemetry/api';
import { GeneralAttribute, MessagingAttribute } from '@opentelemetry/semantic-conventions';
import type amqp from 'amqplib';

export const MESSAGE_STORED_SPAN: unique symbol = Symbol('opentelemetry.amqplib.message.stored-span');
export const CHANNEL_SPANS_NOT_ENDED: unique symbol = Symbol('opentelemetry.amqplib.channel.spans-not-ended');
export const CONNECTION_ATTRIBUTES: unique symbol = Symbol('opentelemetry.amqplib.connection.attributes');

export const normalizeExchange = (exchangeName: string) => (exchangeName !== '' ? exchangeName : '<default>');

const getPort = (portFromUrl: number, protocol: string): number => {
    return portFromUrl || (protocol === 'amqp:' ? 5672 : 5671);
};

export const getConnectionAttributesFromUrl = (
    url: string | amqp.Options.Connect,
    conn: amqp.Connection
): SpanAttributes => {
    const attributes: SpanAttributes = {
        [MessagingAttribute.MESSAGING_PROTOCOL_VERSION]: '0.9.1', // this is the only protocol supported by the instrumented library
    };

    const product = conn?.['serverProperties']?.product?.toLowerCase?.();
    if (product) {
        attributes[MessagingAttribute.MESSAGING_SYSTEM] = product;
    }

    url = url || 'amqp://localhost';
    if (typeof url === 'object') {
        const protocol = (url.protocol || 'amqp') + ':';
        const connectOptions = url as amqp.Options.Connect;
        attributes[MessagingAttribute.MESSAGING_PROTOCOL] = protocol.substr(0, protocol.length - 1).toUpperCase();
        attributes[GeneralAttribute.NET_PEER_NAME] = connectOptions?.hostname ?? 'localhost';
        attributes[GeneralAttribute.NET_PEER_PORT] = getPort(url.port, protocol);
    } else {
        attributes[MessagingAttribute.MESSAGING_URL] = url;
        try {
            const parts = new URL(url);
            attributes[MessagingAttribute.MESSAGING_PROTOCOL] = parts.protocol
                ?.substr(0, parts.protocol.length - 1)
                .toUpperCase();
            attributes[GeneralAttribute.NET_PEER_NAME] = parts.hostname;
            attributes[GeneralAttribute.NET_PEER_PORT] = getPort(parseInt(parts.port), parts.protocol);
        } catch {}
    }
    return attributes;
};

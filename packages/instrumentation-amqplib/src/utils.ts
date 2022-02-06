import {
    Context,
    createContextKey,
    diag,
    SpanAttributes,
    SpanAttributeValue,
    Link,
    SpanContext,
} from '@opentelemetry/api';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import type amqp from 'amqplib';

export const MESSAGE_SETTLE_INFO: unique symbol = Symbol('opentelemetry.amqplib.message.settle-info');
export const CHANNEL_MESSAGES_NOT_SETTLED: unique symbol = Symbol('opentelemetry.amqplib.channel.messages-not-settled');
export const CHANNEL_CONSUME_TIMEOUT_TIMER: unique symbol = Symbol(
    'opentelemetry.amqplib.channel.consumer-timeout-timer'
);
export const CONNECTION_ATTRIBUTES: unique symbol = Symbol('opentelemetry.amqplib.connection.attributes');

const IS_CONFIRM_CHANNEL_CONTEXT_KEY: symbol = createContextKey('opentelemetry.amqplib.channel.is-confirm-channel');

export interface MsgInfoForSettlement {
    deliverContext: SpanContext;
    senderContext: SpanContext;
    msgAttributes: SpanAttributes;
    msg: amqp.Message;
    timeOfConsume: Date;
}

export const normalizeExchange = (exchangeName: string) => (exchangeName !== '' ? exchangeName : '<default>');

const censorPassword = (url: string): string => {
    return url.replace(/:[^:@/]*@/, ':***@');
};

const getPort = (portFromUrl: number, resolvedProtocol: string): number => {
    // we are using the resolved protocol which is upper case
    // this code mimic the behavior of the amqplib which is used to set connection params
    return portFromUrl || (resolvedProtocol === 'AMQP' ? 5672 : 5671);
};

const getProtocol = (protocolFromUrl: string): string => {
    const resolvedProtocol = protocolFromUrl || 'amqp';
    // the substr removed the ':' part of the protocol ('amqp:' -> 'amqp')
    const noEndingColon = resolvedProtocol.endsWith(':')
        ? resolvedProtocol.substr(0, protocolFromUrl.length - 1)
        : resolvedProtocol;
    // upper cases to match spec
    return noEndingColon.toUpperCase();
};

const getHostname = (hostnameFromUrl: string): string => {
    // if user supplies empty hostname, it gets forwarded to 'net' package which default it to localhost.
    // https://nodejs.org/docs/latest-v12.x/api/net.html#net_socket_connect_options_connectlistener
    return hostnameFromUrl || 'localhost';
};

const extractConnectionAttributeOrLog = (
    url: string | amqp.Options.Connect,
    attributeKey: string,
    attributeValue: SpanAttributeValue,
    nameForLog: string
): SpanAttributes => {
    if (attributeValue) {
        return { [attributeKey]: attributeValue };
    } else {
        diag.error(
            `amqplib instrumentation: could not extract connection attribute ${nameForLog} from user supplied url`,
            {
                url,
            }
        );
        return {};
    }
};

export const getConnectionAttributesFromUrl = (
    url: string | amqp.Options.Connect,
    conn: amqp.Connection
): SpanAttributes => {
    const attributes: SpanAttributes = {
        [SemanticAttributes.MESSAGING_PROTOCOL_VERSION]: '0.9.1', // this is the only protocol supported by the instrumented library
    };

    const product = conn?.['serverProperties']?.product?.toLowerCase?.();
    if (product) {
        attributes[SemanticAttributes.MESSAGING_SYSTEM] = product;
    }

    url = url || 'amqp://localhost';
    if (typeof url === 'object') {
        const connectOptions = url as amqp.Options.Connect;

        const protocol = getProtocol(connectOptions?.protocol);
        Object.assign(attributes, {
            ...extractConnectionAttributeOrLog(url, SemanticAttributes.MESSAGING_PROTOCOL, protocol, 'protocol'),
        });

        const hostname = getHostname(connectOptions?.hostname);
        Object.assign(attributes, {
            ...extractConnectionAttributeOrLog(url, SemanticAttributes.NET_PEER_NAME, hostname, 'hostname'),
        });

        const port = getPort(connectOptions.port, protocol);
        Object.assign(attributes, {
            ...extractConnectionAttributeOrLog(url, SemanticAttributes.NET_PEER_PORT, port, 'port'),
        });
    } else {
        const censoredUrl = censorPassword(url);
        attributes[SemanticAttributes.MESSAGING_URL] = censoredUrl;
        try {
            const urlParts = new URL(censoredUrl);

            const protocol = getProtocol(urlParts.protocol);
            Object.assign(attributes, {
                ...extractConnectionAttributeOrLog(
                    censoredUrl,
                    SemanticAttributes.MESSAGING_PROTOCOL,
                    protocol,
                    'protocol'
                ),
            });

            const hostname = getHostname(urlParts.hostname);
            Object.assign(attributes, {
                ...extractConnectionAttributeOrLog(censoredUrl, SemanticAttributes.NET_PEER_NAME, hostname, 'hostname'),
            });

            const port = getPort(parseInt(urlParts.port), protocol);
            Object.assign(attributes, {
                ...extractConnectionAttributeOrLog(censoredUrl, SemanticAttributes.NET_PEER_PORT, port, 'port'),
            });
        } catch (err) {
            diag.error('amqplib instrumentation: error while extracting connection details from connection url', {
                censoredUrl,
                err,
            });
        }
    }
    return attributes;
};

export const markConfirmChannelTracing = (context: Context) => {
    return context.setValue(IS_CONFIRM_CHANNEL_CONTEXT_KEY, true);
};

export const unmarkConfirmChannelTracing = (context: Context) => {
    return context.deleteValue(IS_CONFIRM_CHANNEL_CONTEXT_KEY);
};

export const isConfirmChannelTracing = (context: Context) => {
    return context.getValue(IS_CONFIRM_CHANNEL_CONTEXT_KEY) === true;
};

// those are attributes in the scope of a single message
export const extractConsumerMessageAttributes = (msg: amqp.ConsumeMessage): SpanAttributes => {
    return {
        ['messagin.rabbitmq.exchange_name']: msg.fields?.exchange,
        [SemanticAttributes.MESSAGING_RABBITMQ_ROUTING_KEY]: msg.fields?.routingKey,
        [SemanticAttributes.MESSAGING_MESSAGE_ID]: msg.properties.messageId,
        [SemanticAttributes.MESSAGING_CONVERSATION_ID]: msg.properties.correlationId,
    };
};

export const getSettlementLinks = (message: amqp.Message): Link[] => {
    const settlementInfo: MsgInfoForSettlement = message[MESSAGE_SETTLE_INFO];
    if (!settlementInfo) return [];
    delete message[MESSAGE_SETTLE_INFO];
    const deliverLink = {
        context: settlementInfo.deliverContext,
        attributes: {
            ...settlementInfo.msgAttributes,
            [SemanticAttributes.MESSAGING_OPERATION]: 'deliver',
        }
    }
    const senderLink = {
        context: settlementInfo.senderContext,
        attributes: {
            [SemanticAttributes.MESSAGING_OPERATION]: 'send',
        }
    }
    return [deliverLink, senderLink];
}

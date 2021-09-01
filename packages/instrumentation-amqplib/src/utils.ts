import { Context, createContextKey, diag, SpanAttributes, SpanAttributeValue } from '@opentelemetry/api';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import type amqp from 'amqplib';

export const MESSAGE_STORED_SPAN: unique symbol = Symbol('opentelemetry.amqplib.message.stored-span');
export const CHANNEL_SPANS_NOT_ENDED: unique symbol = Symbol('opentelemetry.amqplib.channel.spans-not-ended');
export const CHANNEL_CONSUME_TIMEOUT_TIMER: unique symbol = Symbol(
    'opentelemetry.amqplib.channel.consumer-timeout-timer'
);
export const CONNECTION_ATTRIBUTES: unique symbol = Symbol('opentelemetry.amqplib.connection.attributes');

const IS_CONFIRM_CHANNEL_CONTEXT_KEY: symbol = createContextKey('opentelemetry.amqplib.channel.is-confirm-channel');

export const normalizeExchange = (exchangeName: string) => (exchangeName !== '' ? exchangeName : '<default>');

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
        attributes[SemanticAttributes.MESSAGING_URL] = url;
        try {
            const urlParts = new URL(url);

            const protocol = getProtocol(urlParts.protocol);
            Object.assign(attributes, {
                ...extractConnectionAttributeOrLog(url, SemanticAttributes.MESSAGING_PROTOCOL, protocol, 'protocol'),
            });

            const hostname = getHostname(urlParts.hostname);
            Object.assign(attributes, {
                ...extractConnectionAttributeOrLog(url, SemanticAttributes.NET_PEER_NAME, hostname, 'hostname'),
            });

            const port = getPort(parseInt(urlParts.port), protocol);
            Object.assign(attributes, {
                ...extractConnectionAttributeOrLog(url, SemanticAttributes.NET_PEER_PORT, port, 'port'),
            });
        } catch (err) {
            diag.error('amqplib instrumentation: error while extracting connection details from connection url', {
                url,
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

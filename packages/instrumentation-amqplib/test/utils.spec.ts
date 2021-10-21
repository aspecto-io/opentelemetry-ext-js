import 'mocha';
import expect from 'expect';
import { getConnectionAttributesFromUrl } from '../src/utils';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';

describe('utils', function () {
    describe('getConnectionAttributesFromUrl', function () {
        it('all features', function () {
            const attributes = getConnectionAttributesFromUrl(`amqp://user:pass@host:10000/vhost`, null);
            expect(attributes).toStrictEqual({
                [SemanticAttributes.MESSAGING_PROTOCOL]: 'AMQP',
                [SemanticAttributes.MESSAGING_PROTOCOL_VERSION]: '0.9.1',
                [SemanticAttributes.NET_PEER_NAME]: 'host',
                [SemanticAttributes.NET_PEER_PORT]: 10000,
                [SemanticAttributes.MESSAGING_URL]: `amqp://user:***@host:10000/vhost`,
            });
        });

        it('all features encoded', function () {
            const attributes = getConnectionAttributesFromUrl(`amqp://user%61:%61pass@ho%61st:10000/v%2fhost`, null);
            expect(attributes).toStrictEqual({
                [SemanticAttributes.MESSAGING_PROTOCOL]: 'AMQP',
                [SemanticAttributes.MESSAGING_PROTOCOL_VERSION]: '0.9.1',
                [SemanticAttributes.NET_PEER_NAME]: 'ho%61st',
                [SemanticAttributes.NET_PEER_PORT]: 10000,
                [SemanticAttributes.MESSAGING_URL]: `amqp://user%61:***@ho%61st:10000/v%2fhost`,
            });
        });

        it('only protocol', function () {
            const attributes = getConnectionAttributesFromUrl(`amqp://`, null);
            expect(attributes).toStrictEqual({
                [SemanticAttributes.MESSAGING_PROTOCOL]: 'AMQP',
                [SemanticAttributes.MESSAGING_PROTOCOL_VERSION]: '0.9.1',
                [SemanticAttributes.NET_PEER_NAME]: 'localhost',
                [SemanticAttributes.NET_PEER_PORT]: 5672,
                [SemanticAttributes.MESSAGING_URL]: `amqp://`,
            });
        });

        it('empty username and password', function () {
            const attributes = getConnectionAttributesFromUrl(`amqp://:@/`, null);
            expect(attributes).toStrictEqual({
                [SemanticAttributes.MESSAGING_PROTOCOL_VERSION]: '0.9.1',
                [SemanticAttributes.MESSAGING_URL]: `amqp://:***@/`,
            });
        });

        it('username and no password', function () {
            const attributes = getConnectionAttributesFromUrl(`amqp://user@`, null);
            expect(attributes).toStrictEqual({
                [SemanticAttributes.MESSAGING_PROTOCOL_VERSION]: '0.9.1',
                [SemanticAttributes.MESSAGING_URL]: `amqp://user@`,
            });
        });

        it('username and password, no host', function () {
            const attributes = getConnectionAttributesFromUrl(`amqp://user:pass@`, null);
            expect(attributes).toStrictEqual({
                [SemanticAttributes.MESSAGING_PROTOCOL_VERSION]: '0.9.1',
                [SemanticAttributes.MESSAGING_URL]: `amqp://user:***@`,
            });
        });

        it('host only', function () {
            const attributes = getConnectionAttributesFromUrl(`amqp://host`, null);
            expect(attributes).toStrictEqual({
                [SemanticAttributes.MESSAGING_PROTOCOL]: 'AMQP',
                [SemanticAttributes.MESSAGING_PROTOCOL_VERSION]: '0.9.1',
                [SemanticAttributes.NET_PEER_NAME]: 'host',
                [SemanticAttributes.NET_PEER_PORT]: 5672,
                [SemanticAttributes.MESSAGING_URL]: `amqp://host`,
            });
        });

        it('port only', function () {
            const attributes = getConnectionAttributesFromUrl(`amqp://:10000`, null);
            expect(attributes).toStrictEqual({
                [SemanticAttributes.MESSAGING_PROTOCOL_VERSION]: '0.9.1',
                [SemanticAttributes.MESSAGING_URL]: `amqp://:10000`,
            });
        });

        it('vhost only', function () {
            const attributes = getConnectionAttributesFromUrl(`amqp:///vhost`, null);
            expect(attributes).toStrictEqual({
                [SemanticAttributes.MESSAGING_PROTOCOL]: 'AMQP',
                [SemanticAttributes.MESSAGING_PROTOCOL_VERSION]: '0.9.1',
                [SemanticAttributes.NET_PEER_NAME]: 'localhost',
                [SemanticAttributes.NET_PEER_PORT]: 5672,
                [SemanticAttributes.MESSAGING_URL]: `amqp:///vhost`,
            });
        });

        it('host only, trailing slash', function () {
            const attributes = getConnectionAttributesFromUrl(`amqp://host/`, null);
            expect(attributes).toStrictEqual({
                [SemanticAttributes.MESSAGING_PROTOCOL]: 'AMQP',
                [SemanticAttributes.MESSAGING_PROTOCOL_VERSION]: '0.9.1',
                [SemanticAttributes.NET_PEER_NAME]: 'host',
                [SemanticAttributes.NET_PEER_PORT]: 5672,
                [SemanticAttributes.MESSAGING_URL]: `amqp://host/`,
            });
        });

        it('vhost encoded', function () {
            const attributes = getConnectionAttributesFromUrl(`amqp://host/%2f`, null);
            expect(attributes).toStrictEqual({
                [SemanticAttributes.MESSAGING_PROTOCOL]: 'AMQP',
                [SemanticAttributes.MESSAGING_PROTOCOL_VERSION]: '0.9.1',
                [SemanticAttributes.NET_PEER_NAME]: 'host',
                [SemanticAttributes.NET_PEER_PORT]: 5672,
                [SemanticAttributes.MESSAGING_URL]: `amqp://host/%2f`,
            });
        });

        it('IPv6 host', function () {
            const attributes = getConnectionAttributesFromUrl(`amqp://[::1]`, null);
            expect(attributes).toStrictEqual({
                [SemanticAttributes.MESSAGING_PROTOCOL]: 'AMQP',
                [SemanticAttributes.MESSAGING_PROTOCOL_VERSION]: '0.9.1',
                [SemanticAttributes.NET_PEER_NAME]: '[::1]',
                [SemanticAttributes.NET_PEER_PORT]: 5672,
                [SemanticAttributes.MESSAGING_URL]: `amqp://[::1]`,
            });
        });
    });
});

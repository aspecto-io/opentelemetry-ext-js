import { MessagingDestinationKindValues, SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { ReadableSpan } from '@opentelemetry/tracing';
import { defaultSocketIoPath, SocketIoInstrumentation, SocketIoInstrumentationAttributes } from '../src';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { getTestSpans } from 'opentelemetry-instrumentation-testing-utils';
import { HttpInstrumentation, HttpInstrumentationConfig } from '@opentelemetry/instrumentation-http';
import { AddressInfo } from 'net';
import expect from 'expect';
import http from 'http';
import 'mocha';

const instrumentation = new SocketIoInstrumentation();
import { Server, Socket } from 'socket.io';
import { io } from 'socket.io-client';

describe('SocketIoInstrumentationConfig', () => {
    describe('filterHttpTransport', () => {
        it('add socket.io path to HttpInstrumentationConfig.ignoreIncomingPaths', () => {
            const httpInstrumentation = new HttpInstrumentation();
            const socketIoInstrumentation = new SocketIoInstrumentation({
                filterHttpTransport: {
                    httpInstrumentation,
                },
            });

            const httpInstrumentationConfig = httpInstrumentation.getConfig() as HttpInstrumentationConfig;
            expect(httpInstrumentationConfig.ignoreIncomingPaths).toContain(defaultSocketIoPath);
        });
    });
});
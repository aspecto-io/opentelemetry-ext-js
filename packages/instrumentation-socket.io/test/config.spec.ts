import { defaultSocketIoPath, SocketIoInstrumentation, SocketIoInstrumentationAttributes } from '../src';
import { HttpInstrumentation, HttpInstrumentationConfig } from '@opentelemetry/instrumentation-http';
import expect from 'expect';

describe('SocketIoInstrumentationConfig', () => {
    describe('filterHttpTransport', () => {
        it('add default socket.io path to HttpInstrumentationConfig.ignoreIncomingPaths', () => {
            const httpInstrumentation = new HttpInstrumentation();
            const socketIoInstrumentation = new SocketIoInstrumentation({
                filterHttpTransport: {
                    httpInstrumentation,
                },
            });

            const httpInstrumentationConfig = httpInstrumentation.getConfig() as HttpInstrumentationConfig;
            expect(httpInstrumentationConfig.ignoreIncomingPaths).toContain(defaultSocketIoPath);
        });

        it('add custom socket.io path to HttpInstrumentationConfig.ignoreIncomingPaths', () => {
            const path = '/test';
            const httpInstrumentation = new HttpInstrumentation();
            const socketIoInstrumentation = new SocketIoInstrumentation({
                filterHttpTransport: {
                    httpInstrumentation,
                    socketPath: path,
                },
            });

            const httpInstrumentationConfig = httpInstrumentation.getConfig() as HttpInstrumentationConfig;
            expect(httpInstrumentationConfig.ignoreIncomingPaths).toContain(path);
        });
    });
});

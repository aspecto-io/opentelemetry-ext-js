import 'mocha';
import { createServer } from 'http';
import { SocketIoInstrumentation } from '../src';
import { InMemorySpanExporter, SimpleSpanProcessor, ReadableSpan, Span } from '@opentelemetry/tracing';
import { NodeTracerProvider } from '@opentelemetry/node';
import { context, diag, SpanStatusCode, ContextManager, DiagConsoleLogger } from '@opentelemetry/api';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import expect from 'expect';

const instrumentation = new SocketIoInstrumentation();
import { Server, Socket, Namespace } from 'socket.io';
import { io } from 'socket.io-client';

describe('socket.io instrumentation', () => {
    const provider = new NodeTracerProvider();
    const memoryExporter = new InMemorySpanExporter();
    const spanProcessor = new SimpleSpanProcessor(memoryExporter);
    provider.addSpanProcessor(spanProcessor);
    instrumentation.setTracerProvider(provider);
    let contextManager: ContextManager;

    const getSocketIoSpans = (): ReadableSpan[] => {
        return memoryExporter.getFinishedSpans().filter((s) => s.attributes['component'] === 'socket.io');
    };

    beforeEach(() => {
        contextManager = new AsyncHooksContextManager();
        context.setGlobalContextManager(contextManager.enable());
        instrumentation.enable();
    });

    afterEach(() => {
        memoryExporter.reset();
        contextManager.disable();
        instrumentation.disable();
    });

    const expectSpan = (spanName: string) => {
        const spans = getSocketIoSpans();
        expect(spans.length).toBeGreaterThan(0);
        const span = spans.find((s) => s.name === spanName);
        expect(span).not.toBeNull();
        expect(span).toBeDefined();
    };

    describe('Server', () => {
        it('emit is instrumented', () => {
            const io = new Server();
            io.emit('test');
            expectSpan('socket.io emit test');
        });

        it('on is instrumented', (done) => {
            const sio = new Server();
            const client = io('http://localhost:3000');
            sio.on('connection', (socket: Socket) => {
                client.close();
                sio.close();
                //trace is created after the listener method is completed
                setTimeout(() => {
                    expectSpan('socket.io on connection');
                    done();
                });
            });
            sio.listen(3000);
        });

        it('broadcast is instrumented', () => {
            const sio = new Server();
            sio.to('room').emit('broadcast', '1234');
            expectSpan('socket.io emit broadcast');
        });
    });

    describe('Namespace', () => {
        it('emit is instrumented', () => {
            const io = new Server();
            io.of('/testing').emit('namespace');
            expectSpan('socket.io emit namespace');
        });
    });
});

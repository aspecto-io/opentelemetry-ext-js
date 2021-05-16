import 'mocha';
import { SocketIoInstrumentation } from '../src';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { InMemorySpanExporter, SimpleSpanProcessor, ReadableSpan } from '@opentelemetry/tracing';
import { NodeTracerProvider } from '@opentelemetry/node';
import { context, ContextManager } from '@opentelemetry/api';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import expect from 'expect';

const instrumentation = new SocketIoInstrumentation();
import { Server, Socket } from 'socket.io';
import { io } from 'socket.io-client';

describe('socket.io instrumentation', () => {
    const provider = new NodeTracerProvider();
    const memoryExporter = new InMemorySpanExporter();
    const spanProcessor = new SimpleSpanProcessor(memoryExporter);
    provider.addSpanProcessor(spanProcessor);
    instrumentation.setTracerProvider(provider);
    let contextManager: ContextManager;

    const getSocketIoSpans = (): ReadableSpan[] =>
        memoryExporter
            .getFinishedSpans()
            .filter((s) => s.attributes[SemanticAttributes.MESSAGING_SYSTEM] === 'socket.io');

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
        return span;
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
            const span = expectSpan('socket.io emit broadcast');
            expect(span.attributes['rooms']).toEqual(['room'].join());
        });

        it('broadcast to multiple rooms', () => {
            const sio = new Server();
            sio.to('room1').to('room2').emit('broadcast', '1234');
            const span = expectSpan('socket.io emit broadcast');
            expect(span.attributes['rooms']).toEqual(['room1', 'room2'].join());
        });
    });

    describe('Namespace', () => {
        it('emit is instrumented', () => {
            const io = new Server();
            const namespace = io.of('/testing');
            namespace.emit('namespace');
            const span = expectSpan('socket.io emit namespace');
        });
    });
});

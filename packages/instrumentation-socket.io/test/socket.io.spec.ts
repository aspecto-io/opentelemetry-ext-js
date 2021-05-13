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
import { io as ioc, Socket as ClientSocket } from 'socket.io-client';

const client = (srv, nsp?: string | object, opts?: object): ClientSocket => {
    if ('object' == typeof nsp) {
        opts = nsp;
        nsp = undefined;
    }
    let addr = srv.address();
    if (!addr) addr = srv.listen().address();
    const url = 'ws://localhost:' + addr.port + (nsp || '');
    return ioc(url, opts);
};

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

    describe('Server', () => {
        it('emit is instrumented', () => {
            const io = new Server();
            io.emit('test');
            const spans = getSocketIoSpans();
            expect(spans.length).toBeGreaterThan(0);
            const span = spans.find((s) => s.name === 'socket.io emit test');
            expect(span).not.toBeNull();
        });

        it('on is instrumented', (done) => {
            const srv = createServer();
            const sio = new Server(srv);
            const executeTest = () => {
                const spans = getSocketIoSpans();
                expect(spans.length).toBeGreaterThan(0);
                const span = spans.find((s) => s.name === 'socket.io on connection');
                expect(span).not.toBeNull();
                srv.close();
                sio.close();
                done();
            };
            srv.listen(() => {
                const socket = client(srv);
                sio.on('connection', (socket: Socket) => {
                    setTimeout(executeTest);
                });
            });
        });

        it('broadcast is instrumented', (done) => {
            const srv = createServer();
            const sio = new Server(srv);

            const onEvent = (data: any) => {
                console.log({ data });
            };

            const end = () => {
                sio.to('room').emit('broadcast', '1234');
                const spans = getSocketIoSpans();
                expect(spans.length).toBeGreaterThan(1);
                const span = spans.find((s) => s.name === 'socket.io emit broadcast');
                expect(span).not.toBeNull();
                expect(span).toBeDefined();
                sio.close();
                srv.close();
                done();
            };
            srv.listen(() => {
                const client1 = client(srv);
                client1.on('test', onEvent);
                const client2 = client(srv);
                client2.on('test', onEvent);

                sio.on('connection', (socket: Socket) => {
                    console.log(socket.id);
                    socket.join('room');
                });
                setTimeout(end, 100);
            });
        });
    });

    describe('Namespace', () => {
        it('emit is instrumented', () => {
            const io = new Server();
            const namespace = io.of('/testing');
            namespace.emit('namespace');
            const spans = getSocketIoSpans();
            expect(spans.length).toBeGreaterThan(0);
            const span = spans.find((s) => s.name === 'socket.io emit namespace');
            expect(span).not.toBeNull();
            expect(span).toBeDefined();
        });
    });
});

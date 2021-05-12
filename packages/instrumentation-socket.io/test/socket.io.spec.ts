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
            expect(spans).toHaveLength(1);
            const span = spans[0];
            expect(span.name).toEqual('socket.io emit test');
        });

        it('on is instrumented', (done) => {
            const srv = createServer();
            const sio = new Server(srv);
            const executeTest = () => {
                const spans = getSocketIoSpans();
                expect(spans).toHaveLength(1);
                const span = spans[0];
                expect(span.name).toEqual('socket.io on connection');
                done();
            };
            srv.listen(() => {
                const socket = client(srv); 
                sio.on('connection', (socket: Socket) => {
                    setTimeout(executeTest);
                });
            });
        });
    });
});

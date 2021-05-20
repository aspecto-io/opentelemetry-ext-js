import { MessagingDestinationKindValues, SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { InMemorySpanExporter, SimpleSpanProcessor, ReadableSpan } from '@opentelemetry/tracing';
import { SocketIoInstrumentation, SocketIoInstrumentationAttributes } from '../src';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import { context, ContextManager, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/node';
import { AddressInfo } from 'net';
import expect from 'expect';
import http from 'http';
import 'mocha';

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

    const expectSpan = (spanName: string, callback?: (span: ReadableSpan) => void, spanCount?: number) => {
        const spans = getSocketIoSpans();
        expect(spans.length).toEqual(spanCount || 1);
        const span = spans.find((s) => s.name === spanName);
        expect(span).toBeDefined();
        callback(span);
    };

    const createServer = (callback: (server: Server, port: number) => void) => {
        const server = http.createServer();
        const sio = new Server(server);
        server.listen(0, () => {
            const port = (server.address() as AddressInfo).port;
            callback(sio, port);
        });
    };

    describe('Server', () => {
        it('emit is instrumented', () => {
            const io = new Server();
            io.emit('test');
            expectSpan('/ send', (span) => {
                expect(span.kind).toEqual(SpanKind.PRODUCER);
                expect(span.attributes[SemanticAttributes.MESSAGING_SYSTEM]).toEqual('socket.io');
                expect(span.attributes[SemanticAttributes.MESSAGING_DESTINATION_KIND]).toEqual(
                    MessagingDestinationKindValues.TOPIC
                );
            });
        });

        it('emit reserved events error is instrumented', () => {
            instrumentation.setConfig({
                traceReserved: true,
            });
            const io = new Server();
            try {
                io.emit('connect');
            } catch (error) {}
            expectSpan('/ send', (span) => {
                expect(span.status.code).toEqual(SpanStatusCode.ERROR);
                expect(span.status.message).toEqual('"connect" is a reserved event name');
            });
        });

        it('send is instrumented', () => {
            const io = new Server();
            io.send('test');
            expectSpan('/ send', (span) => {
                expect(span.kind).toEqual(SpanKind.PRODUCER);
                expect(span.attributes[SemanticAttributes.MESSAGING_SYSTEM]).toEqual('socket.io');
                expect(span.attributes[SemanticAttributes.MESSAGING_DESTINATION_KIND]).toEqual(
                    MessagingDestinationKindValues.TOPIC
                );
            });
        });

        it('emitHook is called', () => {
            instrumentation.setConfig({
                traceReserved: true,
                emitHook: (span, hookInfo) => {
                    span.setAttribute('payload', JSON.stringify(hookInfo.payload));
                },
            });
            const io = new Server();
            io.emit('test', 1234);
            expectSpan('/ send', (span) => {
                expect(span.attributes['payload']).toEqual(JSON.stringify([1234]));
            });
        });

        it('emitHook error does not effect trace', () => {
            instrumentation.setConfig({
                emitHook: () => {
                    throw new Error('Throwing');
                },
            });

            const io = new Server();
            io.emit('test');
            const spans = getSocketIoSpans();
            expect(spans.length).toBe(1);
        });

        it('onHook is called', (done) => {
            instrumentation.setConfig({
                onHook: (span, hookInfo) => {
                    span.setAttribute('payload', JSON.stringify(hookInfo.payload));
                },
            });
            const data = {
                name: 'bob',
                age: 28,
            };
            createServer((sio, port) => {
                const client = io(`http://localhost:${port}`);
                client.on('ping', () => client.emit('pong', data));
                sio.on('connection', (socket: Socket) => {
                    socket.emit('ping');
                    socket.on('pong', (data) => {
                        client.close();
                        sio.close();
                        //trace is created after the listener method is completed
                        setTimeout(() => {
                            expectSpan(
                                'pong receive',
                                (span) => {
                                    expect(span.kind).toEqual(SpanKind.CONSUMER);
                                    expect(span.attributes[SemanticAttributes.MESSAGING_SYSTEM]).toEqual('socket.io');
                                    expect(span.attributes['payload']).toEqual(JSON.stringify([data]));
                                    done();
                                },
                                2
                            );
                        });
                    });
                });
            });
        });

        it('traceReserved:true on is instrumented', (done) => {
            instrumentation.setConfig({
                traceReserved: true,
            });
            createServer((sio, port) => {
                const client = io(`http://localhost:${port}`);
                sio.on('connection', () => {
                    client.close();
                    sio.close();
                    //trace is created after the listener method is completed
                    setTimeout(() => {
                        expectSpan('connection receive', (span) => {
                            expect(span.kind).toEqual(SpanKind.CONSUMER);
                            expect(span.attributes[SemanticAttributes.MESSAGING_SYSTEM]).toEqual('socket.io');
                            done();
                        });
                    });
                });
            });
        });

        it('on is instrumented', (done) => {
            createServer((sio, port) => {
                const client = io(`http://localhost:${port}`);
                client.on('ping', () => client.emit('pong'));
                sio.on('connection', (socket: Socket) => {
                    socket.emit('ping');
                    socket.on('pong', () => {
                        client.close();
                        sio.close();
                        //trace is created after the listener method is completed
                        setTimeout(() => {
                            expectSpan(
                                'pong receive',
                                (span) => {
                                    expect(span.kind).toEqual(SpanKind.CONSUMER);
                                    expect(span.attributes[SemanticAttributes.MESSAGING_SYSTEM]).toEqual('socket.io');
                                    done();
                                },
                                2
                            );
                        });
                    });
                });
            });
        });

        it('broadcast is instrumented', () => {
            const roomName = 'room';
            const sio = new Server();
            sio.to(roomName).emit('broadcast', '1234');
            expectSpan('/[room] send', (span) => {
                expect(span.attributes[SocketIoInstrumentationAttributes.SOCKET_IO_ROOMS]).toEqual([roomName]);
            });
        });

        it('broadcast to multiple rooms', () => {
            const sio = new Server();
            sio.to('room1').to('room2').emit('broadcast', '1234');
            expectSpan('/[room1,room2] send', (span) => {
                expect(span.attributes[SocketIoInstrumentationAttributes.SOCKET_IO_ROOMS]).toEqual(['room1', 'room2']);
            });
        });
    });

    describe('Namespace', () => {
        it('emit is instrumented', () => {
            const io = new Server();
            const namespace = io.of('/testing');
            namespace.emit('namespace');
            expectSpan('/testing send', (span) => {
                expect(span.attributes[SocketIoInstrumentationAttributes.SOCKET_IO_NAMESPACE]).toEqual('/testing');
            });
        });

        it('broadcast is instrumented', () => {
            const roomName = 'room';
            const io = new Server();
            const namespace = io.of('/testing');
            namespace.to(roomName).emit('broadcast', '1234');
            expectSpan('/testing[room] send', (span) => {
                expect(span.attributes[SocketIoInstrumentationAttributes.SOCKET_IO_ROOMS]).toEqual([roomName]);
            });
        });

        it('broadcast to multiple rooms', () => {
            const io = new Server();
            const namespace = io.of('/testing');
            namespace.to('room1').to('room2').emit('broadcast', '1234');
            expectSpan('/testing[room1,room2] send', (span) => {
                expect(span.attributes[SocketIoInstrumentationAttributes.SOCKET_IO_NAMESPACE]).toEqual('/testing');
                expect(span.attributes[SocketIoInstrumentationAttributes.SOCKET_IO_ROOMS]).toEqual(['room1', 'room2']);
            });
        });

        it('on is instrumented', (done) => {
            createServer((sio, port) => {
                const namespace = sio.of('/testing');
                const client = io(`http://localhost:${port}/testing`);
                client.on('ping', () => client.emit('pong'));
                namespace.on('connection', (socket: Socket) => {
                    socket.emit('ping');
                    socket.on('pong', () => {
                        client.close();
                        sio.close();
                        //trace is created after the listener method is completed
                        setTimeout(() => {
                            expectSpan('/testing pong receive', (span) => {
                                expect(span.kind).toEqual(SpanKind.CONSUMER);
                                expect(span.attributes[SemanticAttributes.MESSAGING_SYSTEM]).toEqual('socket.io');
                                expect(span.attributes[SemanticAttributes.MESSAGING_DESTINATION]).toEqual(
                                    '/testing pong'
                                );
                                done();
                            });
                        });
                    });
                });
            });
        });
    });
});

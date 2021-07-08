import { MessagingDestinationKindValues, SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { ReadableSpan } from '@opentelemetry/tracing';
import { SocketIoInstrumentation, SocketIoInstrumentationAttributes, SocketIoInstrumentationConfig } from '../src';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { getTestSpans } from 'opentelemetry-instrumentation-testing-utils';
import expect from 'expect';
import 'mocha';

const instrumentation = new SocketIoInstrumentation();
import { Server, Socket } from 'socket.io';
import { createServer, createServerInstance, io } from './utils';

describe('SocketIoInstrumentation', () => {
    const getSocketIoSpans = (): ReadableSpan[] =>
        getTestSpans().filter((s) => s.attributes[SemanticAttributes.MESSAGING_SYSTEM] === 'socket.io');

    beforeEach(() => {
        instrumentation.enable();
    });

    afterEach(() => {
        instrumentation.disable();
    });

    const expectSpan = (spanName: string, callback?: (span: ReadableSpan) => void, spanCount?: number) => {
        const spans = getSocketIoSpans();
        expect(spans.length).toEqual(spanCount || 1);
        const span = spans.find((s) => s.name === spanName);
        expect(span).toBeDefined();
        callback(span);
    };

    describe('Server', () => {
        it('emit is instrumented', () => {
            const io = createServerInstance();
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
            const config: SocketIoInstrumentationConfig = {
                traceReserved: true,
            };
            instrumentation.setConfig(config);
            const io = createServerInstance();
            try {
                io.emit('connect');
            } catch (error) {}
            expectSpan('/ send', (span) => {
                expect(span.status.code).toEqual(SpanStatusCode.ERROR);
                expect(span.status.message).toEqual('"connect" is a reserved event name');
            });
        });

        it('send is instrumented', () => {
            const io = createServerInstance();
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
            const config: SocketIoInstrumentationConfig = {
                traceReserved: true,
                emitHook: (span, hookInfo) => {
                    span.setAttribute('payload', JSON.stringify(hookInfo.payload));
                },
            };
            instrumentation.setConfig(config);

            const io = createServerInstance();
            io.emit('test', 1234);
            expectSpan('/ send', (span) => {
                expect(span.attributes['payload']).toEqual(JSON.stringify([1234]));
            });
        });

        it('emitHook error does not effect trace', () => {
            const config: SocketIoInstrumentationConfig = {
                emitHook: () => {
                    throw new Error('Throwing');
                },
            };
            instrumentation.setConfig(config);
            const io = createServerInstance();
            io.emit('test');
            const spans = getSocketIoSpans();
            expect(spans.length).toBe(1);
        });

        it('onHook is called', (done) => {
            const config: SocketIoInstrumentationConfig = {
                onHook: (span, hookInfo) => {
                    span.setAttribute('payload', JSON.stringify(hookInfo.payload));
                },
            };
            instrumentation.setConfig(config);
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
                                3
                            );
                        });
                    });
                });
            });
        });

        it('traceReserved:true on is instrumented', (done) => {
            const config: SocketIoInstrumentationConfig = {
                traceReserved: true,
            };
            instrumentation.setConfig(config);
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
                                3
                            );
                        });
                    });
                });
            });
        });

        it('broadcast is instrumented', () => {
            const roomName = 'room';
            const sio = createServerInstance();
            sio.to(roomName).emit('broadcast', '1234');
            expectSpan('/[room] send', (span) => {
                expect(span.attributes[SemanticAttributes.MESSAGING_DESTINATION]).toEqual('/');
                expect(span.attributes[SocketIoInstrumentationAttributes.SOCKET_IO_ROOMS]).toEqual([roomName]);
            });
        });

        it('broadcast to multiple rooms', () => {
            const sio = createServerInstance();
            sio.to('room1').to('room2').emit('broadcast', '1234');
            expectSpan('/[room1,room2] send', (span) => {
                expect(span.attributes[SemanticAttributes.MESSAGING_DESTINATION]).toEqual('/');
                expect(span.attributes[SocketIoInstrumentationAttributes.SOCKET_IO_ROOMS]).toEqual(['room1', 'room2']);
            });
        });
    });

    describe('Namespace', () => {
        it('emit is instrumented', () => {
            const io = createServerInstance();
            const namespace = io.of('/testing');
            namespace.emit('namespace');
            expectSpan('/testing send', (span) => {
                expect(span.attributes[SemanticAttributes.MESSAGING_DESTINATION]).toEqual('/testing');
                expect(span.attributes[SocketIoInstrumentationAttributes.SOCKET_IO_NAMESPACE]).toEqual('/testing');
            });
        });

        it('broadcast is instrumented', () => {
            const roomName = 'room';
            const io = createServerInstance();
            const namespace = io.of('/testing');
            namespace.to(roomName).emit('broadcast', '1234');
            expectSpan('/testing[room] send', (span) => {
                expect(span.attributes[SemanticAttributes.MESSAGING_DESTINATION]).toEqual('/testing');
                expect(span.attributes[SocketIoInstrumentationAttributes.SOCKET_IO_ROOMS]).toEqual([roomName]);
                expect(span.attributes[SocketIoInstrumentationAttributes.SOCKET_IO_NAMESPACE]).toEqual('/testing');
            });
        });

        it('broadcast to multiple rooms', () => {
            const io = createServerInstance();
            const namespace = io.of('/testing');
            namespace.to('room1').to('room2').emit('broadcast', '1234');
            expectSpan('/testing[room1,room2] send', (span) => {
                expect(span.attributes[SemanticAttributes.MESSAGING_DESTINATION]).toEqual('/testing');
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
                            expectSpan(
                                '/testing pong receive',
                                (span) => {
                                    expect(span.kind).toEqual(SpanKind.CONSUMER);
                                    expect(span.attributes[SemanticAttributes.MESSAGING_SYSTEM]).toEqual('socket.io');
                                    expect(span.attributes[SemanticAttributes.MESSAGING_DESTINATION]).toEqual(
                                        '/testing'
                                    );
                                    done();
                                },
                                2
                            );
                        });
                    });
                });
            });
        });
    });

    describe('Socket', () => {
        it('emit is instrumented', (done) => {
            createServer((sio, port) => {
                const client = io(`http://localhost:${port}`);
                sio.on('connection', (socket: Socket) => {
                    socket.emit('ping');
                    client.close();
                    sio.close();
                    expectSpan(`/[${socket.id}] send`, (span) => {
                        expect(span.kind).toEqual(SpanKind.PRODUCER);
                        expect(span.attributes[SemanticAttributes.MESSAGING_SYSTEM]).toEqual('socket.io');
                        done();
                    });
                });
            });
        });
    });
});

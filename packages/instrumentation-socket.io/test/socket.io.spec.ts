import 'mocha';
import { SocketIoInstrumentation } from '../src';
import { InMemorySpanExporter, SimpleSpanProcessor, ReadableSpan, Span } from '@opentelemetry/tracing';
import { NodeTracerProvider } from '@opentelemetry/node';
import { context, diag, SpanStatusCode, ContextManager, DiagConsoleLogger } from '@opentelemetry/api';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import expect from 'expect';

const instrumentation = new SocketIoInstrumentation();
import { Server, Socket, Namespace } from 'socket.io';

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
        });
    });
});

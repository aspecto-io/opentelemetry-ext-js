import { Span } from '@opentelemetry/api';
import { InstrumentationConfig } from '@opentelemetry/instrumentation';
import type * as io from 'socket.io';

export type TransportInstrumentationConfig = {
    httpInstrumentation: any;
    socketPath: string;
};
export interface SocketIoHookInfo {
    args: any;
}
export interface SocketIoHookFunction {
    (span: Span, hookInfo: SocketIoHookInfo): void;
}
export interface SocketIoInstrumentationConfig extends InstrumentationConfig {
    /** Hook for adding custom attributes before socket.io emits the event */
    emitHook?: SocketIoHookFunction;
    /** Hook for adding custom attributes before the event listener (callback) is invoked */
    onHook?: SocketIoHookFunction;
    /** Set to true if you want to trace socket.io reserved events (see https://socket.io/docs/v4/emit-cheatsheet/#Reserved-events) */
    traceReserved?: boolean;
    /** Set to TransportInstrumentationConfig if you want to filter out socket.io HTTP transport */
    filterTransport?: false | TransportInstrumentationConfig;
}
export type Io = typeof io;

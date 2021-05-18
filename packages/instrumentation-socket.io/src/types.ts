import { Span } from '@opentelemetry/api';
import { InstrumentationConfig } from '@opentelemetry/instrumentation';
import type * as io from 'socket.io';

export type TransportInstrumentationConfig = {
    httpInstrumentation: any;
    socketPath: string;
};
export type EmitHook = (span: Span, args: any) => void;
export type OnHook = (span: Span, args: any) => void;
export interface SocketIoInstrumentationConfig extends InstrumentationConfig {
    /** Hook for adding custom attributes before socket.io emits the event */
    emitHook?: EmitHook;
    /** Hook for adding custom attributes before the event listener (callback) is invoked */
    onHook?: OnHook;
    /** Set to true if you want to trace socket.io reserved events (see https://socket.io/docs/v4/emit-cheatsheet/#Reserved-events) */
    traceReserved?: boolean;
    /** Set to TransportInstrumentationConfig if you want to filter out socket.io HTTP transport */
    filterTransport?: false | TransportInstrumentationConfig;
}
export type Io = typeof io;

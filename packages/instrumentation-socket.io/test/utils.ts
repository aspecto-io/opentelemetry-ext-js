import { strict as assert} from 'assert';
import http from 'http';
import { AddressInfo } from 'net';

import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { ReadableSpan } from '@opentelemetry/tracing';
import { getTestSpans } from 'opentelemetry-instrumentation-testing-utils';

import expect from 'expect';
import { Server, Socket } from 'socket.io';
import socketIo from 'socket.io';
import * as ioClient from 'socket.io-client';

export const io = (ioClient.io || (ioClient as any).default) as typeof ioClient.io;
const version = require('../node_modules/socket.io/package.json').version;

assert.equal(typeof version, 'string');

export const createServer = (callback: (server: Server, port: number) => void) => {
    const server = http.createServer();
    const sio = createServerInstance(server);
    server.listen(0, () => {
        const port = (server.address() as AddressInfo).port;
        callback(sio, port);
    });
};

export const createServerInstance = (server?: http.Server) => {
    if (version && /^2\./.test(version)) {
        return (socketIo as any)(server);
    }
    return new Server(server);
};


export const getSocketIoSpans = (): ReadableSpan[] =>
    getTestSpans().filter((s) => s.attributes[SemanticAttributes.MESSAGING_SYSTEM] === 'socket.io');

export const expectSpan = (spanName: string, callback?: (span: ReadableSpan) => void, spanCount?: number) => {
    const spans = getSocketIoSpans();
    expect(spans.length).toEqual(spanCount || 1);
    const span = spans.find((s) => s.name === spanName);
    expect(span).toBeDefined();
    callback(span);
};

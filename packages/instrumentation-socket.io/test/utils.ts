import { AddressInfo } from 'net';
import http from 'http';

import { strict as assert} from 'assert';
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

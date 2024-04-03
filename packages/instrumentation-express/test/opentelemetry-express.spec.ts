import 'mocha';
import expect from 'expect';
import { SpanKind, trace } from '@opentelemetry/api';
import { ExpressInstrumentation } from '../src';
import { AddressInfo } from 'net';
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { getTestSpans, registerInstrumentationTesting } from '@opentelemetry/contrib-test-utils';
import * as bodyParser from 'body-parser';

const instrumentation = registerInstrumentationTesting(new ExpressInstrumentation());
// add http instrumentation so we can test proper assignment of route attribute.
const httpInstrumentation = new HttpInstrumentation();
httpInstrumentation.enable();
httpInstrumentation.disable();
instrumentation.enable();
instrumentation.disable();

import axios from 'axios';
import express from 'express';
import * as http from 'http';
import { getExpressSpans } from './utils';
import { ExpressRequestHookInformation } from '../src/types';

describe('opentelemetry-express', () => {
    let app: express.Application;

    before(() => {
        // registerInstrumentationTesting currently support only 1 instrumentation
        // test memory exporter initialized at beforeAll hook
        httpInstrumentation.setTracerProvider(trace.getTracerProvider());

        instrumentation.enable();
        httpInstrumentation.enable();
        app = express();
        app.use(bodyParser.json());
    });

    after(() => {
        instrumentation.disable();
        httpInstrumentation.disable();
    });

    it('express attributes', (done) => {
        const router = express.Router();
        app.use('/toto', router);
        router.post('/:id', (req, res, next) => {
            res.set('res-custom-header-key', 'res-custom-header-val');
            return res.json({ hello: 'world' });
        });

        const server = http.createServer(app);
        server.listen(0, async () => {
            const port = (server.address() as AddressInfo).port;
            const requestData = { 'req-data-key': 'req-data-val' };
            try {
                await axios.post(
                    `http://localhost:${port}/toto/tata?req-query-param-key=req-query-param-val`,
                    requestData,
                    {
                        headers: {
                            'req-custom-header-key': 'req-custom-header-val',
                        },
                    }
                );
            } catch (err) {}
            try {
                const expressSpans: ReadableSpan[] = getExpressSpans();
                expect(expressSpans.length).toBe(1);
                const span: ReadableSpan = expressSpans[0];

                // Span name
                expect(span.name).toBe('POST /toto/:id');

                // HTTP Attributes
                expect(span.attributes[SemanticAttributes.HTTP_METHOD]).toBeUndefined();
                expect(span.attributes[SemanticAttributes.HTTP_TARGET]).toBeUndefined();
                expect(span.attributes[SemanticAttributes.HTTP_SCHEME]).toBeUndefined();
                expect(span.attributes[SemanticAttributes.HTTP_STATUS_CODE]).toBeUndefined();
                expect(span.attributes[SemanticAttributes.HTTP_HOST]).toBeUndefined();
                expect(span.attributes[SemanticAttributes.HTTP_FLAVOR]).toBeUndefined();
                expect(span.attributes[SemanticAttributes.NET_PEER_IP]).toBeUndefined();

                // http span route
                const [incomingHttpSpan] = getTestSpans().filter(
                    (s) => s.kind === SpanKind.SERVER && s.instrumentationLibrary.name.includes('http')
                );
                expect(incomingHttpSpan.attributes[SemanticAttributes.HTTP_ROUTE]).toMatch('/toto/:id');
                done();
            } catch (error) {
                done(error);
            } finally {
                server.close();
            }
        });
    });

    it('express with http attributes', (done) => {
        instrumentation.disable();
        instrumentation.setConfig({
            includeHttpAttributes: true,
        });
        instrumentation.enable();

        const router = express.Router();
        app.use('/toto', router);
        router.post('/:id', (req, res, next) => {
            res.set('res-custom-header-key', 'res-custom-header-val');
            return res.json({ hello: 'world' });
        });

        const server = http.createServer(app);
        server.listen(0, async () => {
            const port = (server.address() as AddressInfo).port;
            const requestData = { 'req-data-key': 'req-data-val' };

            try {
                await axios.post(
                    `http://localhost:${port}/toto/tata?req-query-param-key=req-query-param-val`,
                    requestData,
                    {
                        headers: {
                            'req-custom-header-key': 'req-custom-header-val',
                        },
                    }
                );
            } catch (err) {}

            const expressSpans: ReadableSpan[] = getExpressSpans();
            expect(expressSpans.length).toBe(1);
            const span: ReadableSpan = expressSpans[0];

            // HTTP Attributes
            expect(span.attributes[SemanticAttributes.HTTP_METHOD]).toBe('POST');
            expect(span.attributes[SemanticAttributes.HTTP_TARGET]).toBe(
                '/toto/tata?req-query-param-key=req-query-param-val'
            );
            expect(span.attributes[SemanticAttributes.HTTP_SCHEME]).toBe('http');
            expect(span.attributes[SemanticAttributes.HTTP_STATUS_CODE]).toBe(200);
            expect(span.attributes[SemanticAttributes.HTTP_HOST]).toBe(`localhost:${port}`);
            expect(span.attributes[SemanticAttributes.HTTP_FLAVOR]).toBe('1.1');
            expect(span.attributes[SemanticAttributes.NET_PEER_IP]).toBe('::1');

            server.close();
            done();
        });
    });

    it('use empty res.end() to terminate response', (done) => {
        app.get('/toto', (req, res, next) => {
            res.end();
        });

        const server = http.createServer(app);
        server.listen(0, async () => {
            const port = (server.address() as AddressInfo).port;
            try {
                await axios.get(`http://localhost:${port}/toto`);
            } catch (err) {}
            const expressSpans: ReadableSpan[] = getExpressSpans();
            expect(expressSpans.length).toBe(1);
            server.close();
            done();
        });
    });

    it('mount app', (done) => {
        const subApp = express();
        subApp.get('/sub-app', (req, res) => res.end());
        app.use('/top-level-app', subApp);

        const server = http.createServer(app);
        server.listen(0, async () => {
            const port = (server.address() as AddressInfo).port;
            try {
                await axios.get(`http://localhost:${port}/top-level-app/sub-app`);
            } catch (err) {}
            const expressSpans: ReadableSpan[] = getExpressSpans();
            expect(expressSpans.length).toBe(1);

            server.close();
            done();
        });
    });

    it('should record exceptions as span events', async () => {
        app.get('/throws-exception', (req, res, next) => {
            next(new Error('internal exception'));
        });

        const server = http.createServer(app);
        await new Promise<void>((resolve) => server.listen(0, () => resolve()));
        const port = (server.address() as AddressInfo).port;
        try {
            await axios.get(`http://localhost:${port}/throws-exception`);
        } catch (err) {
            // we expect 500
        }
        const expressSpans: ReadableSpan[] = getExpressSpans();
        expect(expressSpans.length).toBe(1);
        const span: ReadableSpan = expressSpans[0];

        expect(span.events?.length).toEqual(1);
        const [event] = span.events;
        expect(event).toMatchObject({
            name: 'exception',
            attributes: {
                'exception.type': 'Error',
                'exception.message': 'internal exception',
            },
        });
        server.close();
    });

    it('should record multiple exceptions', async () => {
        app.get('/throws-exception', (req, res, next) => {
            next(new Error('internal exception'));
        });

        app.use((err, req, res, next) => {
            next(new Error('error-handling middleware exception'));
        });

        const server = http.createServer(app);
        await new Promise<void>((resolve) => server.listen(0, () => resolve()));
        const port = (server.address() as AddressInfo).port;
        try {
            await axios.get(`http://localhost:${port}/throws-exception`);
        } catch (err) {
            // we expect 500
        }
        const expressSpans: ReadableSpan[] = getExpressSpans();
        expect(expressSpans.length).toBe(1);
        const span: ReadableSpan = expressSpans[0];

        expect(span.events?.length).toEqual(2);
        const [event1, event2] = span.events;
        expect(event1).toMatchObject({
            name: 'exception',
            attributes: {
                'exception.type': 'Error',
                'exception.message': 'internal exception',
            },
        });

        expect(event2).toMatchObject({
            name: 'exception',
            attributes: {
                'exception.type': 'Error',
                'exception.message': 'error-handling middleware exception',
            },
        });
        server.close();
    });

    it('requestHook', async () => {
        instrumentation.disable();
        instrumentation.setConfig({
            requestHook: (span, requestInfo: ExpressRequestHookInformation) => {
                span.setAttribute('content_type', requestInfo.req.headers['content-type']);
            },
        });
        instrumentation.enable();

        app.post('/request-hook', (_req, res) => {
            res.sendStatus(200);
        });
        const server = http.createServer(app);
        await new Promise<void>((resolve) => server.listen(0, () => resolve()));
        const port = (server.address() as AddressInfo).port;

        await axios.post(`http://localhost:${port}/request-hook`, { rick: 'morty' });

        const expressSpans: ReadableSpan[] = getExpressSpans();
        expect(expressSpans.length).toBe(1);
        const span: ReadableSpan = expressSpans[0];
        expect(span.attributes['content_type']).toBe('application/json;charset=utf-8');
        server.close();
    });
});

import 'mocha';
import expect from 'expect';

import { ExpressInstrumentation } from '../src';
import { AddressInfo } from 'net';
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { registerInstrumentationTesting } from '@opentelemetry/contrib-test-utils';

const instrumentation = registerInstrumentationTesting(new ExpressInstrumentation());

import axios from 'axios';
import express from 'express';
import * as http from 'http';
import {
    errorMiddleware,
    expectRouteAttributes,
    expectRouteFromFinalHandler,
    getExpressSpans,
    noopErrorMiddleware,
    noopMiddleware,
    resEndErrorMiddleware,
    resEndMiddleware,
    shouldNotInvokeMiddleware,
} from './utils';
import { describe } from 'mocha';

describe('opentelemetry-express-layers', () => {
    let app: express.Application;

    const sendRequest = async (urlPath: string): Promise<ReadableSpan> => {
        return new Promise((resolve) => {
            const server = http.createServer(app);
            server.listen(0, async () => {
                try {
                    const port = (server.address() as AddressInfo).port;
                    try {
                        await axios.get(`http://localhost:${port}${urlPath}`, {
                            params: { 'test-param-1': 'test-param-1-value' },
                        });
                    } catch (err) {
                        // console.log(err);
                    }

                    server.close();
                    resolve(getExpressSpans()[0]);
                } catch (err) {
                    console.log(err);
                }
            });
        });
    };

    beforeEach(() => {
        instrumentation.enable();
    });

    beforeEach(() => {
        app = express();
    });

    it('no routes registered', async () => {
        await sendRequest('/no-routes');
    });

    it('app use without path', async () => {
        app.use((req, res, next) => {
            res.sendStatus(200);
        });

        const s = await sendRequest('/foo');

        // '/foo' was not consumed by any router or route. thus it's not part of the route.
        expectRouteAttributes(s, '', '/foo');
    });

    it('app use', async () => {
        app.use('/foo', (req, res, next) => {
            res.sendStatus(200);
        });

        const s = await sendRequest('/foo');

        expectRouteAttributes(s, '/foo', '/foo');
    });

    it('app use middleware with name', async () => {
        const middlewareName = (req, res, next) => {
            res.sendStatus(200);
        };
        app.use('/foo', middlewareName);

        const s = await sendRequest('/foo');
        expectRouteAttributes(s, '/foo', '/foo');
    });

    it('app use multiple middlewares', async () => {
        const middlewareName1 = (req, res, next) => {
            next();
        };
        const middlewareName2 = (req, res, next) => {
            next();
        };
        const middlewareName3 = (req, res, next) => {
            res.sendStatus(200);
        };
        app.use('/foo', middlewareName1, middlewareName2, middlewareName3);

        const s = await sendRequest('/foo');
        expectRouteAttributes(s, '/foo', '/foo');
    });

    it('multiple middlewares set as array', async () => {
        const middlewareName1 = (req, res, next) => {
            next();
        };
        const middlewareName2 = (req, res, next) => {
            next();
        };
        const middlewareName3 = (req, res, next) => {
            res.sendStatus(200);
        };
        app.use('/foo', [middlewareName1, middlewareName2, middlewareName3]);

        const s = await sendRequest('/foo');
        expectRouteAttributes(s, '/foo', '/foo');
    });

    it('router without path', async () => {
        const router = express.Router();
        router.use((req, res, next) => {
            res.sendStatus(200);
        });
        app.use('/foo', router);

        const s = await await sendRequest('/foo/bar');
        expectRouteAttributes(s, '/foo', '/foo/bar');
    });

    it('router use multiple middlewares', async () => {
        const middlewareName1 = (req, res, next) => {
            next();
        };
        const middlewareName2 = (req, res, next) => {
            next();
        };
        const middlewareName3 = (req, res, next) => {
            res.sendStatus(200);
        };
        const router = express.Router();
        router.use('/bar', middlewareName1, middlewareName2, middlewareName3);
        app.use('/foo', router);

        const s = await sendRequest('/foo/bar');
        expectRouteAttributes(s, '/foo/bar', '/foo/bar');
    });

    it('middleware chain break, expect only executed', async () => {
        const middlewareName1 = (req, res, next) => {
            next();
        };
        const middlewareName2 = (req, res, next) => {
            res.sendStatus(200);
        };
        const middlewareName3 = (req, res, next) => {
            throw new Error('middleware should not run as previous middleware did not call next');
        };
        app.use('/foo', middlewareName1, middlewareName2, middlewareName3);

        const s = await sendRequest('/foo');
        expectRouteAttributes(s, '/foo', '/foo');
    });

    it('path parameter', async () => {
        const middlewareName1 = (req, res, next) => {
            next();
        };
        const middlewareName2 = (req, res, next) => {
            res.sendStatus(200);
        };
        app.use('/foo/:id', middlewareName1, middlewareName2);

        const s = await sendRequest('/foo/19');
        expectRouteAttributes(s, '/foo/:id', '/foo/:id', { expectedParams: { id: '19' } });
    });

    it('router with use', async () => {
        const middlewareName1 = (req, res, next) => {
            res.sendStatus(200);
        };
        const router = express.Router().use(middlewareName1);
        app.use('/foo', router);

        const s = await sendRequest('/foo');
        expectRouteAttributes(s, '/foo', '/foo');
    });

    it('router with path parameters', async () => {
        const router = express.Router().all('/:id2', (req, res, next) => {
            res.sendStatus(200);
        });
        app.use('/foo/:id1', router);

        const s = await sendRequest('/foo/1/2');
        expectRouteAttributes(s, '/foo/:id1/:id2', '/foo/:id1/:id2', { expectedParams: { id1: '1', id2: '2' } });
    });

    it('route created in router with path', async () => {
        const middlewareName1 = (req, res, next) => {
            res.sendStatus(200);
        };
        app.route('/foo').get(middlewareName1);

        const s = await sendRequest('/foo');
        expectRouteAttributes(s, '/foo', '/foo');
    });

    it('multiple middlewares in route', async () => {
        const middlewareName1 = (req, res, next) => {
            next();
        };
        const middlewareName2 = (req, res, next) => {
            res.sendStatus(200);
        };
        app.route('/foo').get(middlewareName1, middlewareName2);

        const s = await sendRequest('/foo');
        expectRouteAttributes(s, '/foo', '/foo');
    });

    it('midlleware in route with http method `all`', async () => {
        const middlewareName1 = (req, res, next) => {
            res.sendStatus(200);
        };
        app.route('/foo').all(middlewareName1);

        const s = await sendRequest('/foo');
        expectRouteAttributes(s, '/foo', '/foo');
    });

    it('app with call to method', async () => {
        const middlewareName1 = (req, res, next) => {
            res.sendStatus(200);
        };
        app.get('/foo', middlewareName1);

        const s = await sendRequest('/foo');
        expectRouteAttributes(s, '/foo', '/foo');
    });

    it('middleware with two parameters', async () => {
        const middlewareName1 = (req, res) => {
            res.sendStatus(200);
        };
        app.get('/foo', middlewareName1);

        const s = await sendRequest('/foo');
        expectRouteAttributes(s, '/foo', '/foo');
    });

    it('two routers', async () => {
        const middlewareName1 = (req, res, next) => {
            res.sendStatus(200);
        };
        app.use('/foo', (req, res, next) => {
            next();
        });
        app.use('/foo', middlewareName1);

        const s = await sendRequest('/foo');
        expectRouteAttributes(s, '/foo', '/foo');
    });

    it('multi nested routers create branched tree, and finishing with finalhandler', async () => {
        const router1 = express.Router();
        router1.use('/bar', function mw1(req, res, next) {
            next();
        });
        const router2 = express.Router();
        router2.use('/bar', function mw2(req, res, next) {
            next();
        });
        app.use('/foo', router1, router2);

        const s = await sendRequest('/foo/bar');
        expectRouteFromFinalHandler(s, '/foo/bar');
    });

    it('multiple paths in app', async () => {
        app.use(['/p1', '/p2'], (req, res, next) => {
            res.sendStatus(200);
        });
        const s = await sendRequest('/p2');
        expectRouteAttributes(s, '/p2', '/p2', { configuredRoute: '["/p1","/p2"]' });
    });

    it('multiple path in router', async () => {
        const router = express.Router();
        router.use(['/p1', '/p2'], (req, res, next) => {
            res.sendStatus(200);
        });
        app.use(router);
        const s = await sendRequest('/p2');
        expectRouteAttributes(s, '/p2', '/p2', {
            configuredRoute: '["/p1","/p2"]',
        });
    });

    it('path is regex', async () => {
        app.use(new RegExp('/ab*c'), (req, res, next) => {
            res.sendStatus(200);
        });
        const s = await sendRequest('/abbbbbc');
        expectRouteAttributes(s, '/\\/ab*c/', '/\\/ab*c/');
    });

    it('error indication break middleware chain, and captured by finalhandler', async () => {
        const middlewareName1 = (req, res, next) => {
            next();
        };
        const middlewareName2 = (req, res, next) => {
            next('error on middleware 2'); // handled by finalhandler
        };
        const middlewareName3 = (req, res, next) => {
            throw new Error('middleware should not run as previous middleware did not call next');
        };
        app.use('/foo', middlewareName1, middlewareName2, middlewareName3);

        const s = await sendRequest('/foo');
        expectRouteFromFinalHandler(s, '/foo');
    });

    it('basic err capture from middleware next(err) call', async () => {
        app.use('/foo', (req, res, next) => {
            next('error message from middleware'); // handled by finalhandler
        });

        const s = await sendRequest('/foo');
        expectRouteFromFinalHandler(s, '/foo');
    });

    it('next("route") should not be marked as error', async () => {
        const middlewareStopRoute = (req, res, next) => {
            next('route'); // handled by finalhandler
        };
        const middleware2 = (req, res, next) => {
            res.sendStatus(200);
        };
        app.route('/foo').all(middlewareStopRoute, middleware2); // request fallback to finalhandler

        const s = await sendRequest('/foo');
        expectRouteFromFinalHandler(s, '/foo');
    });

    it('basic err capture from middleware throw string', async () => {
        app.use('/foo', (req, res, next) => {
            throw 'error message from middleware';
        });

        const s = await sendRequest('/foo');
        expectRouteFromFinalHandler(s, '/foo');
    });

    it('basic err capture from middleware throw exception', async () => {
        app.use('/foo', (req, res, next) => {
            throw Error('error message from middleware');
        });

        const s = await sendRequest('/foo');
        expectRouteFromFinalHandler(s, '/foo');
    });

    it('error middleware should not create a layer for non error req', async () => {
        const middlewareName1 = (req, res, next) => {
            next();
        };
        const middlewareName2 = (err, req, res, next) => {
            throw new Error('middleware should not run since its an error handling middleware');
        };
        const middlewareName3 = (req, res, next) => {
            res.sendStatus(200);
        };
        app.use('/foo', middlewareName1, middlewareName2, middlewareName3);

        const s = await sendRequest('/foo');
        expectRouteAttributes(s, '/foo', '/foo');
    });

    it('error in one route should not forward to other route', async () => {
        app.route('/foo').all(function firstRoute(req, res, next) {
            next('error in first route'); // handled by finalhandler
        });
        // second route should NOT be called and collected as we have an error
        app.route('/foo').all(function secondRoute(req, res, next) {
            res.sendStatus(200);
        });

        const s = await sendRequest('/foo');
        expectRouteFromFinalHandler(s, '/foo');
    });

    it('error middleware in layers if executed', async () => {
        const middlewareThrow = (req, res, next) => {
            next('error msg from first middleware');
        };
        const errorHandlingMiddleware = (err, req, res, next) => {
            next('some other err from error middleware');
        };

        app.use('/foo', middlewareThrow, errorHandlingMiddleware); // handled by finalhandler

        const s = await sendRequest('/foo');
        expectRouteFromFinalHandler(s, '/foo');
    });

    // express default error handler is not a middleware (implemented as a callback function),
    // so it does not create a layer
    it('error in middleware without custom handler', async () => {
        const middlewareThrow = (req, res, next) => {
            next('error msg from first middleware');
        };
        app.use('/foo', middlewareThrow); // handled by finalhandler

        const s = await sendRequest('/foo');
        expectRouteFromFinalHandler(s, '/foo');
    });

    it('multiple error middleware handlers in different levels', async () => {
        const throwingMiddleware = (req, res, next) => {
            next('error msg from first middleware');
        };
        const routerInternalErrorMiddleware = (err, req, res, next) => {
            next(err);
        };
        const generalErrorMiddleware = (err, req, res, next) => {
            next(err);
        };
        const router = express.Router().use(throwingMiddleware, routerInternalErrorMiddleware);
        app.use('/foo', router, generalErrorMiddleware);

        const s = await sendRequest('/foo');
        expectRouteFromFinalHandler(s, '/foo');
    });

    describe('express router', () => {
        describe('path trimming', () => {
            it('router without path', async () => {
                const router = express.Router();
                router.use(resEndMiddleware);
                app.use(router);
                const s = await sendRequest('/foo');
                expectRouteAttributes(s, '', '/foo');
            });

            it('router with path till end', async () => {
                const router = express.Router();
                router.use('/foo', resEndMiddleware);
                app.use(router);
                const s = await sendRequest('/foo');
                expectRouteAttributes(s, '/foo', '/foo');
            });

            it('router with strict false remove trailing slash in path end', async () => {
                const router = express.Router({ strict: false });
                router.use('/foo/', resEndMiddleware);
                app.use(router);
                const s = await sendRequest('/foo');
                expectRouteAttributes(s, '/foo', '/foo');
            });

            it('router with partial path', async () => {
                const router = express.Router();
                router.use('/foo', resEndMiddleware);
                app.use(router);
                const s = await sendRequest('/foo/bar');
                expectRouteAttributes(s, '/foo', '/foo/bar');
            });

            it('router without path registered under a path', async () => {
                const router = express.Router();
                router.use(resEndMiddleware);
                app.use('/foo', router);
                const s = await sendRequest('/foo');
                expectRouteAttributes(s, '/foo', '/foo');
            });

            it('router without path registered under a path with path leftovers', async () => {
                const router = express.Router();
                router.use(resEndMiddleware);
                app.use('/foo', router);
                const s = await sendRequest('/foo/bar');
                expectRouteAttributes(s, '/foo', '/foo/bar');
            });

            it('router with path registered under a path without leftovers', async () => {
                const router = express.Router();
                router.use('/bar', resEndMiddleware);
                app.use('/foo', router);
                const s = await sendRequest('/foo/bar');
                expectRouteAttributes(s, '/foo/bar', '/foo/bar');
            });

            it('router with path registered under a path with leftovers', async () => {
                const router = express.Router();
                router.use('/bar', resEndMiddleware);
                app.use('/foo', router);
                const s = await sendRequest('/foo/bar/baz');
                expectRouteAttributes(s, '/foo/bar', '/foo/bar/baz');
            });

            it('router with slash', async () => {
                const router = express.Router();
                router.use('/foo', resEndMiddleware);
                app.use('/', router);
                const s = await sendRequest('/foo/bar/baz');
                expectRouteAttributes(s, '/foo', '/foo/bar/baz');
            });

            it('router use with slash', async () => {
                const router = express.Router();
                router.use('/', resEndMiddleware);
                app.use('/foo', router);
                const s = await sendRequest('/foo/bar/baz');
                expectRouteAttributes(s, '/foo', '/foo/bar/baz');
            });
        });

        describe('multiple middlewares', () => {
            it('two middlewares under same router', async () => {
                app.use(express.Router().use('/foo', noopMiddleware, resEndMiddleware));
                const s = await sendRequest('/foo');
                expectRouteAttributes(s, '/foo', '/foo');
            });

            it('two middlewares under different router, second is invoked', async () => {
                const router = express.Router();
                router.use('/:firstRouteParam', noopMiddleware);
                router.use('/:secondRouteParam', resEndMiddleware);
                app.use(router);
                const s = await sendRequest('/foo');
                expectRouteAttributes(s, '/:secondRouteParam', '/:secondRouteParam', {
                    expectedParams: { secondRouteParam: 'foo' },
                });
            });

            it('two middlewares under different router, first is invoked', async () => {
                const router = express.Router();
                router.use('/:firstRouteParam', resEndMiddleware);
                router.use('/:secondRouteParam', shouldNotInvokeMiddleware);
                app.use(router);
                const s = await sendRequest('/foo');
                expectRouteAttributes(s, '/:firstRouteParam', '/:firstRouteParam', {
                    expectedParams: { firstRouteParam: 'foo' },
                });
            });
        });

        describe('multiple routers', () => {
            describe('sibling routers', () => {
                it('second router terminate req', async () => {
                    app.use(express.Router().use('/:firstRouteParam', noopMiddleware));
                    app.use(express.Router().use('/:secondRouteParam', resEndMiddleware));
                    const s = await sendRequest('/foo');
                    expectRouteAttributes(s, '/:secondRouteParam', '/:secondRouteParam', {
                        expectedParams: { secondRouteParam: 'foo' },
                    });
                });

                it('first router not matching path', async () => {
                    app.use(express.Router().use('/non-executing-path', resEndMiddleware));
                    app.use(express.Router().use('/foo', resEndMiddleware));
                    const s = await sendRequest('/foo');
                    expectRouteAttributes(s, '/foo', '/foo');
                });

                it('first router not matching path', async () => {
                    app.use(express.Router().use('/non-executing-path', resEndMiddleware));
                    app.use(express.Router().use('/foo', resEndMiddleware));
                    const s = await sendRequest('/foo');
                    expectRouteAttributes(s, '/foo', '/foo');
                });
            });

            describe('descendant', () => {
                it('routers without path', async () => {
                    const childRouter = express.Router().use(resEndMiddleware);
                    const parentRouter = express.Router().use(childRouter);
                    app.use(parentRouter);
                    const s = await sendRequest('/foo');
                    expectRouteAttributes(s, '', '/foo');
                });

                it('routers with path', async () => {
                    const childRouter = express.Router().use('/baz', resEndMiddleware);
                    const parentRouter = express.Router().use('/bar', childRouter);
                    app.use('/foo', parentRouter);
                    const s = await sendRequest('/foo/bar/baz');
                    expectRouteAttributes(s, '/foo/bar/baz', '/foo/bar/baz');
                });
            });
        });
    });

    describe('express route', () => {
        describe('registration types', () => {
            it('route.all', async () => {
                app.all('/foo', resEndMiddleware);
                const s = await sendRequest('/foo');
                expectRouteAttributes(s, '/foo', '/foo');
            });

            it('route.get', async () => {
                app.get('/foo', resEndMiddleware);
                const s = await sendRequest('/foo');
                expectRouteAttributes(s, '/foo', '/foo');
            });

            it('verb other than the one being invoked', async () => {
                // req is sent with GET but we registered POST
                // thus it should not be executed and fallback toi finalhandler
                app.post('/foo', resEndMiddleware);
                const s = await sendRequest('/foo');
                expectRouteFromFinalHandler(s, '/foo');
            });

            it('registered to route directly', async () => {
                const route = app.route('/foo');
                route.get(resEndMiddleware);
                const s = await sendRequest('/foo');
                expectRouteAttributes(s, '/foo', '/foo');
            });

            it('route with two verbs both executed', async () => {
                const route = app.route('/foo');
                route.all(noopMiddleware);
                route.get(resEndMiddleware);
                const s = await sendRequest('/foo');
                expectRouteAttributes(s, '/foo', '/foo');
            });

            it('route with slash', async () => {
                // fast_slash does not work with routes in express, thus this request will reach finalhandler
                app.all('/', resEndMiddleware);
                const s = await sendRequest('/foo');
                expectRouteFromFinalHandler(s, '/foo');
            });
        });

        describe('path manipulations', () => {
            it('route path with multiple parts', async () => {
                app.all('/foo/bar', resEndMiddleware);
                const s = await sendRequest('/foo/bar');
                expectRouteAttributes(s, '/foo/bar', '/foo/bar');
            });

            it('route path only match prefix', async () => {
                // route should match path to the end,
                // '/foo' does not match '/foo/bar'
                // thus, request is handled by finalhandler which does not set HTTP_ROUTE
                app.all('/foo', resEndMiddleware);
                const s = await sendRequest('/foo/bar');
                expectRouteFromFinalHandler(s, '/foo/bar');
            });

            it('route path slash should not be catched', async () => {
                // route should match path to the end, with not exception to slash (all paths)
                // thus, request is handled by finalhandler which does not set HTTP_ROUTE
                app.all('/', resEndMiddleware);
                const s = await sendRequest('/foo');
                expectRouteFromFinalHandler(s, '/foo');
            });
        });

        describe('multiple routes', () => {
            it('two sibling routes, first is calling res.end()', async () => {
                app.get('/:firstRouteParam', resEndMiddleware);
                app.get('/:secondRouteParam', (_req: express.Request, _res: express.Response) => {
                    throw new Error('should not be invoked');
                });
                const s = await sendRequest('/foo');
                expectRouteAttributes(s, '/:firstRouteParam', '/:firstRouteParam', {
                    expectedParams: { firstRouteParam: 'foo' },
                });
            });

            it('two sibling routes, second is calling res.end()', async () => {
                app.get('/:firstRouteParam', noopMiddleware);
                app.get('/:secondRouteParam', resEndMiddleware);
                const s = await sendRequest('/foo');
                expectRouteAttributes(s, '/:secondRouteParam', '/:secondRouteParam', {
                    expectedParams: { secondRouteParam: 'foo' },
                });
            });
        });
    });

    describe('layer multiple paths', () => {
        it('path array with single value', async () => {
            app.use(['/foo'], resEndMiddleware);
            const s = await sendRequest('/foo');
            expectRouteAttributes(s, '/foo', '/foo', { configuredRoute: '["/foo"]' });
        });

        it('two string paths, match first one', async () => {
            app.use(['/foo', '/bar'], resEndMiddleware);
            const s = await sendRequest('/foo');
            expectRouteAttributes(s, '/foo', '/foo', {
                configuredRoute: '["/foo","/bar"]',
            });
        });

        it('two string paths, match second', async () => {
            app.use(['/foo', '/bar'], resEndMiddleware);
            const s = await sendRequest('/bar');
            expectRouteAttributes(s, '/bar', '/bar', {
                configuredRoute: '["/foo","/bar"]',
            });
        });

        it('two string paths, match both', async () => {
            app.use(['/:pathParam', '/foo'], resEndMiddleware);
            const s = await sendRequest('/foo');
            // /:pathParam is first in the list, so it should match
            expectRouteAttributes(s, '/:pathParam', '/:pathParam', {
                expectedParams: { pathParam: 'foo' },
                configuredRoute: '["/:pathParam","/foo"]',
            });
        });

        it('strict mode true should capture the right path', async () => {
            const router = express.Router({ strict: true });
            router.use(['/foo/', '/foo'], resEndMiddleware);
            app.use(router);
            const s = await sendRequest('/foo');
            expectRouteAttributes(s, '/foo', '/foo', {
                configuredRoute: '["/foo","/foo"]',
            });
        });

        it('two regexp paths', async () => {
            app.use([/^\/foo$/, '/foo'], resEndMiddleware);
            const s = await sendRequest('/foo');
            // should match the regexp as it is first in the list
            expectRouteAttributes(s, '/^\\/foo$/', '/^\\/foo$/', {
                configuredRoute: '["/^\\\\/foo$/","/foo"]',
            });
        });

        it('multiple paths, non match', async () => {
            // path not matched, so it will invoke finalhandler
            app.use(['/bar', '/baz'], shouldNotInvokeMiddleware);
            const s = await sendRequest('/foo');
            expectRouteFromFinalHandler(s, '/foo');
        });

        it('multiple paths in multiple hierarchies', async () => {
            const router1 = express.Router();
            router1.all('/baz', resEndMiddleware);
            const router2 = express.Router();
            router2.use(['/foo2', '/bar2'], router1);
            app.use(['/foo1', '/bar1'], router2);
            const s = await sendRequest('/foo1/bar2/baz');
            expectRouteAttributes(s, '/foo1/bar2/baz', '/foo1/bar2/baz', {
                configuredRoute: '["/foo1","/bar1"]["/foo2","/bar2"]/baz',
            });
        });
    });

    describe('mounted app', () => {
        it('app mounted under another app', async () => {
            const mountedApp = express();
            mountedApp.use('/route-in-internal-app', resEndMiddleware);
            app.use('/mounted-app', mountedApp);
            const s = await sendRequest('/mounted-app/route-in-internal-app/foo');
            expectRouteAttributes(s, '/mounted-app/route-in-internal-app', '/mounted-app/route-in-internal-app/foo');
        });

        it('mounted app not invoked', async () => {
            const mountedApp = express();
            mountedApp.use('/route-in-internal-app', resEndMiddleware);
            app.use('/mounted-app', mountedApp);
            app.use('/foo', resEndMiddleware);
            const s = await sendRequest('/foo');
            expectRouteAttributes(s, '/foo', '/foo');
        });
    });

    describe('error middleware', () => {
        it('error middleware under app', async () => {
            app.use('/foo', errorMiddleware);
            app.use(resEndErrorMiddleware);
            const s = await sendRequest('/foo');
            expectRouteAttributes(s, '', '/foo');
        });

        it('error middleware under same use call', async () => {
            app.use('/foo', errorMiddleware, resEndErrorMiddleware);
            const s = await sendRequest('/foo');
            // in this case '/foo' path has been consumed by the error middleware in use.
            expectRouteAttributes(s, '/foo', '/foo');
        });

        it('error middleware under router', async () => {
            const router = express.Router();
            router.use('/bar', errorMiddleware);
            router.use(resEndErrorMiddleware);
            app.use('/foo', router);
            const s = await sendRequest('/foo/bar/baz');
            // in this case '/foo' path has been consumed by the error middleware in use.
            expectRouteAttributes(s, '/foo', '/foo/bar/baz');
        });

        it('error in router, handled by app', async () => {
            const router = express.Router();
            router.use('/bar', errorMiddleware);
            app.use('/foo', router);
            app.use(resEndErrorMiddleware);
            const s = await sendRequest('/foo/bar');
            expectRouteAttributes(s, '', '/foo/bar');
        });

        it('error middleware that just forward the error', async () => {
            app.use('/foo', errorMiddleware, noopErrorMiddleware);
            app.use(resEndErrorMiddleware);
            const s = await sendRequest('/foo');
            expectRouteAttributes(s, '', '/foo');
        });
    });

    describe('path params', () => {
        it('single parameter in app', async () => {
            app.use('/:id', resEndMiddleware);
            const s = await sendRequest('/1234');
            expectRouteAttributes(s, '/:id', '/:id', { expectedParams: { id: '1234' } });
        });

        it('multiple parameter in app', async () => {
            app.use('/:id1/:id2', resEndMiddleware);
            const s = await sendRequest('/1234/5678');
            expectRouteAttributes(s, '/:id1/:id2', '/:id1/:id2', { expectedParams: { id1: '1234', id2: '5678' } });
        });

        it('params from router', async () => {
            const router = express.Router();
            router.use('/:id2', resEndMiddleware);
            app.use('/:id1', router);
            const s = await sendRequest('/1234/5678');
            expectRouteAttributes(s, '/:id1/:id2', '/:id1/:id2', { expectedParams: { id1: '1234', id2: '5678' } });
        });

        describe('advanced path param', () => {
            it('two params on same path part', async () => {
                app.use('/:from-:to', resEndMiddleware);
                const s = await sendRequest('/1234-5678');
                expectRouteAttributes(s, '/:from-:to', '/:from-:to', { expectedParams: { from: '1234', to: '5678' } });
            });

            it('params with regexp', async () => {
                app.use('/:idnumeric(\\d+)', resEndMiddleware);
                const s = await sendRequest('/1234');
                expectRouteAttributes(s, '/:idnumeric(\\d+)', '/:idnumeric(\\d+)', {
                    expectedParams: { idnumeric: '1234' },
                });
            });
        });

        describe('multiple path options', () => {
            it('multiple matching path alternative should use first', async () => {
                app.use(['/:idnumeric(\\d+)', '/:idnonnumeric'], resEndMiddleware);
                const s = await sendRequest('/1234');
                expectRouteAttributes(s, '/:idnumeric(\\d+)', '/:idnumeric(\\d+)', {
                    expectedParams: { idnumeric: '1234' },
                    configuredRoute: '["/:idnumeric(\\\\d+)","/:idnonnumeric"]',
                });
            });

            it('multiple path alternative second matches', async () => {
                app.use(['/:idnumeric(\\d+)', '/:idnonnumeric'], resEndMiddleware);
                const s = await sendRequest('/text');
                expectRouteAttributes(s, '/:idnonnumeric', '/:idnonnumeric', {
                    expectedParams: { idnonnumeric: 'text' },
                    configuredRoute: '["/:idnumeric(\\\\d+)","/:idnonnumeric"]',
                });
            });
        });

        describe('param hiding', () => {
            it('same param name multiple times should capture last value', async () => {
                const router = express.Router();
                router.use('/:id', resEndMiddleware);
                app.use('/:id', router);
                const s = await sendRequest('/1234/5678');
                expectRouteAttributes(s, '/:id/:id', '/:id/:id', { expectedParams: { id: '5678' } });
            });
        });
    });

    describe('async middlewares', () => {
        it('res.end called from async context should create correct route', async () => {
            app.use('/foo', async (req, res) => {
                await new Promise((resolve) => setTimeout(resolve, 1));
                res.sendStatus(200);
            });
            const s = await sendRequest('/foo/bar');
            expectRouteAttributes(s, '/foo', '/foo/bar');
        });

        it('res.end from callback', async () => {
            app.use('/foo', (req, res) => {
                setTimeout(() => res.sendStatus(200), 2);
            });
            const s = await sendRequest('/foo/bar');
            expectRouteAttributes(s, '/foo', '/foo/bar');
        });

        it('res.end from promise then', async () => {
            app.use('/foo', (req, res) => {
                new Promise((resolve) => setTimeout(resolve, 2)).then(() => res.sendStatus(200));
            });
            const s = await sendRequest('/foo/bar');
            expectRouteAttributes(s, '/foo', '/foo/bar');
        });

        it('multiple async calling each other', async () => {
            const router = express.Router();
            router.all('/bar', async (req, res, next) => {
                await new Promise((resolve) => setTimeout(resolve, 1));
                res.sendStatus(200);
            });
            app.use(
                '/foo',
                async (req, res, next) => {
                    new Promise((resolve) => setTimeout(resolve, 2));
                    next();
                },
                router
            );
            const s = await sendRequest('/foo/bar');
            expectRouteAttributes(s, '/foo/bar', '/foo/bar');
        });

        it('async middleware runs in parallel to downstream middlewares', async () => {
            app.use('/foo', (req, res, next) => {
                next();
                new Promise((resolve) => setTimeout(resolve, 2)).then(() => res.sendStatus(200));
                res.sendStatus(200);
            });
            app.use((req, res, next) => {
                /* terminate middleware chain */
            });
            const s = await sendRequest('/foo/bar');
            expectRouteAttributes(s, '/foo', '/foo/bar');
        });

        it('thenable should not break the context', async () => {
            app.use('/foo', async (req, res, next) => {
                const thenable = {
                    then: function (onFulfilled) {
                        setTimeout(onFulfilled, 2);
                    },
                };
                // @ts-ignore
                await Promise.resolve(thenable);
                res.sendStatus(200);
            });
            const s = await sendRequest('/foo/bar');
            expectRouteAttributes(s, '/foo', '/foo/bar');
        });
    });
});

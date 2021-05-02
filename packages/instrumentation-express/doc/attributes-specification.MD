# Attributes Specifications for Express instrumentation
There is no special category for express in opentelemetry [trace semantic conventions specification](https://github.com/open-telemetry/opentelemetry-specification/tree/main/specification/trace/semantic_conventions#trace-semantic-conventions) to follow. On the other end, there is data which is interesting to collect, but does not appear in http or any other semantic convention document.

This auto instrumentation is setting following attributes on the span:

## `http.route`
This is a conventional http attribute, which is collected by express instead of the http module (which is not aware of the route).

### Cardinality
The route attribute is design to have low cardinality. It will never contain arbitrary ids on the url path such as `/users/1234`, but will always contain `/users/:id`. The number of permutations depends only on the number of express middlewares (or routers/routes), and the number of hard-coded `path`s, configured when calling things like `app.use([path1, path2], router)`.

This guarantee is strong, since backend systems can use this route in various low-cardinality ways. However, there is also a price - if middleware stack terminated early, the route only contains the `path`s on components that we have already consumed:
```js
const router = express.Router();
router.get('/user/:id', (req, res) => res.json({name: 'foo'});

const authMiddleware = (req, res, next) => {
  const isAuthorized = false; // in real apps this will have logic
  if(!isAuthorized) {
    res.sendStatus(401);
    return; // terminate the middleware chain early, before '/user/:id' is consumed
  }

  next();
}
app.use('/api', authMiddleware, router); // router will not be invoked if authMiddleware does not call next()
```
Calling this app (when auth fails), will result in `http.route` attribute to be `/api`, since this is all we consumed from the path at the point res is ended.

### Covered Cases 
This instrumentation goal is to produce correct route attributes in all common use cases, and all the edge cases we could think about. But it is still possible that we missed some. If you encounter a case which is not cover, you are welcome to:
- [Open an issue](https://github.com/aspecto-io/opentelemetry-ext-js/issues) to let us know. 
- Or, you can [open a PR](https://github.com/aspecto-io/opentelemetry-ext-js/pulls) with a fix. Make sure all current tests are green and add a test for the case under [opentelemetry-express-layers.spec.ts](./test/opentelemetry-express-layers.spec.ts).

### Semantic Behavior
Since express routing can be quite complex, we will list here the properties of the calculated route, with examples.

#### Relevant Middleware
Route is calculated from the perspective of the middleware which invoked `res.end` (or some other function which invoke `res.end()` such as `res.sendStatus()`):
```js
app.use(express.Router().use('/:firstRouteParam', (req, res, next) => {
  next();
}));

app.use(express.Router().use('/:secondRouteParam', (req, res) => {
  res.sendStatus(200);
}));
```

Invoking this express app with `"/foo"` will produce Route attribute of `/:secondRouteParam` as this is the middleware which terminate the request.

#### Multiple Paths
In express, user can set an array of paths, which will invoke the middlewares if one match is found. The instrumentation will report the first route that matched a path from the array:
```js
app.use(['/baz', '/:routeByParam', '/foo'], (req, res, next) => {
  res.sendStatus(200)
});
```
The above example, when invoked with `"/foo"`, will produce route attribute `/:routeByParam`, since it is the first match to `/foo`.

#### Hierarchy
Express implements advanced routing via `Router`s, `Route`s and custom user middlewares. Whenever a routing component is matching a url path prefix, it is concatenated to the route. Leftovers of the path after all components paths are fused, is NOT part of the route (as it might contain high cardinality data). Check out `express.route.full` for this value
```js
const v1Router = express.Router();
const authRouter = express.Router();
authRouter.use('/p*', (req, res, next) => {
  // do some auth logic, and call next() on success.
  next();
});
v1Router.use('/products/:id', (req, res) => res.sendStatus(200));
const versionRouter = express.Router();
versionRouter.use('/v1', authRouter, v1Router);
app.use(['/api', '/some-other-path'], versionRouter);
```

Invoking the above example with path `"/api/v1/products/123"` will produce route attribute: `/api/v1/products/:id`. Notice how multiple matched routers path were joined together to form the full parameterized route. 

Notice also that during routing the request we also invoked internal router `authRouter`, which consumed some '/p*' part of the path, and then restored it when auth router terminated.

#### Mounted App
Express allows to define an app, and mount it under a path in another express app. Mounted app behave just like any other router in regards to routing:
```js
const mountedApp = express();
mountedApp.use('/route-in-internal-app', resEndMiddleware);
app.use('/mounted-app', mountedApp);
```
Calling this app with path `"/mounted-app/route-in-internal-app"` will produce the route attributes: `/mounted-app/route-in-internal-app` on the main app correctly.

#### Error Middleware
Express Error Middleware is a function with 4 arguments in this format: `(err: any, req: express.Request, res: express.Response, next: express.NextFunction)`. The same behavior for route calculation also holds for error middlewares:
```js
app.use('/foo', (req, res, next) => next('some error'));
app.use((err, req, res, next) => res.sendStatus(500));
```
Calling this app with path `/foo` will result in express error, which will be propagated to error middleware. `http.route` will equal `""` (empty string) in this case, since the res ends in a middleware which is mounted under main path. Notice that even thought the error is created in internal middleware under `/foo`, the route still does not contain it, as the res is ended after we end the `/foo` middlewares and handle the errors in the general context.

## `express.route.full`
This is a custom attribute produced by this instrumentation (not part of the spec). The purpose is to supply a way to build "the big picture" for early terminated requests, and unconsumed path part.

### Cardinality
This attribute can produce high cardinality value space, and should be used accordingly (can contain millions of different routes such as '/users/38264', '/users/9386916', etc).

If we look again at the example in [http.route](#httproute):
```js
const router = express.Router();
router.get('/user/:id', (req, res) => res.json({name: 'foo'});

const authMiddleware = (req, res, next) => {
  const isAuthorized = false; // in real apps this will have logic
  if(!isAuthorized) {
    res.sendStatus(401);
    return; // terminate the middleware chain early, before '/user/:id' is consumed
  }

  next();
}
app.use('/api', authMiddleware, router); // router will not be invoked if authMiddleware does not call next()
```
The `http.route` is just the part we consumed: `/api`. But `express.route.full` will equal `/api/user/273861287` (notice that the full route contains arbitrary id, and we might have millions of those).

The part `/user/:id` was never run, thus it is not part of the route.

## `express.route.params`
This attribute holds a json stringified map, where the keys are the url path param names, and the values are the matched params from the actual url:
```js
app.use('/:id', resEndMiddleware);
```
Calling this app with path `/1234` will produce the `express.route.params` attribute: `{"id":"1234"}`.

### Cardinality
Since this attribute contains user ids and possibly any text, it has high cardinality value space.

### Params Hiding
There is one pitfall to this attribute, which is not expected in normal apps. if in the same route, some param name is found multiple times, then only the last value will be recorded:
```js
const router = express.Router();
router.use('/:id', resEndMiddleware);
app.use('/:id', router);
```
In this case, `id` is found twice on the path. When this app is called with path `"/1/2"`, `express.route.params` will hold just the last value `2`: `{"id":"2"}` as the previous value `1` was overwritten by the second one.

## `express.route.configured`
This attribute reduces further the cardinality compared to `http.route` by producing a route that shows exactly how express was configured when multiple alternatives are possible.

For example: `app.use(['/foo', '/bar'], (req, res, next) => {...})` when invoked with `/foo`, this attribute will hold value `["/foo", "/bar"]`. In this case, `http.route` will be equal to the matched path `/foo`, but if we invoke the app again with `/bar`, `http.route` will change to `/bar` while `express.route.configured` will stay the same.

### Cardinality
This attribute is expected to have even lower cardinality than `http.route` as invocations of an app with multiple path alternatives (`app.use(['/foo', '/bar'], ...)`) will produce the same configured route. When multiple path alternatives are configured on few layers, the result could be many many permutations which all describe the same code execution path.

Although rare, configuring multiple path alternatives is valid and supported in express, and this instrumentation library offers low cardinality option for different use cases also in edge case.

### Closer to Code
The `http.route` and `express.route.full` attributes are very useful when it is important to know the matched path out of the possible configured alternatives. `http.route` looks better in UI, and better capture the intent while debugging single request. But it is lacking the info about how express was actually configured (with multiple alternatives), and hide the fact that we matched one option out of few.

`express.route.full` attribute can serve to point the developer to the right place (in code), and to get a fuller picture of the trace while examining the span attributes.

## `express.unhandled`
Boolean value indicating if the request was not handled by any middleware in express, and got fallback to the default app `finalhandler`. this can happen if user sent invalid path or method (resulting in 404).

## `express.instrumentation.errors`
In case of internal error in instrumentation, this attribute will contain the error description. There are no known valid use cases which are expected to produce this attribute.

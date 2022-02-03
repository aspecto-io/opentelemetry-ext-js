import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { AmqplibInstrumentation } from 'opentelemetry-instrumentation-amqplib';
registerInstrumentations({ instrumentations: [new AmqplibInstrumentation()] });

import express from 'express';
import displayRoutes from 'express-routemap';
import { helloWorldRouter } from './examples/hello-world';
import { connectToAmqp } from './utils';
import { publishSubscribeRouter } from './examples/publish-subscribe';
import { routingRouter } from './examples/routing';
import { topicsRouter } from './examples/topics';
import { workQueuesRouter } from './examples/work-queues';

const httpPort = process.env.PORT ?? 3032;
const app: express.Application = express();
app.use(express.raw({ type: '*/*' }));

const amqplibRouter = express.Router();
amqplibRouter.use('/hello-world', helloWorldRouter);
amqplibRouter.use('/publish-subscribe', publishSubscribeRouter);
amqplibRouter.use('/routing', routingRouter);
amqplibRouter.use('/topics', topicsRouter);
amqplibRouter.use('/work-queues', workQueuesRouter);
app.use('/amqplib', amqplibRouter);

(async () => {
    try {
        await connectToAmqp();
        app.listen(httpPort, () => console.log('\n🦠 amqplib demo application is up on port ' + httpPort));
        displayRoutes(app);
    } catch {}
})();

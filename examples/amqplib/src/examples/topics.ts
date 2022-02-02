import { ConsumeMessage } from 'amqplib';
import express from 'express';
import { getConnection } from '../utils';

export const topicsRouter = express.Router();

topicsRouter.post('/:exchangeName/:queueName', async (req: express.Request, res: express.Response) => {
    const exchangeName = req.params['exchangeName'];
    const queueName = req.params['queueName'];
    const channel = await getConnection().createChannel();
    await channel.assertExchange(exchangeName, 'topic', { durable: false });
    const hadSpaceInBuffer = channel.publish(exchangeName, queueName, Buffer.from(req.body));
    await channel.close();
    console.log(`Sent "${req.body}" to queue ${queueName} in exchange ${exchangeName}`);
    res.json({ hadSpaceInBuffer });
});

topicsRouter.get('/:exchangeName/:pattern', async (req: express.Request, res: express.Response) => {
    const exchangeName = req.params['exchangeName'];
    const pattern = req.params['pattern'];
    const channel = await getConnection().createChannel();
    await channel.assertExchange(exchangeName, 'topic', { durable: false });
    const { queue: queueName } = await channel.assertQueue('', { durable: false });
    await channel.bindQueue(queueName, exchangeName, pattern);

    const receivedMessages: string[] = [];
    await channel.consume(
        queueName,
        (msg: ConsumeMessage | null) => {
            if(msg) {
                receivedMessages.push(msg.content.toString());
            }
        },
        { noAck: true }
    );
    console.log(
        `registered a consumer for routing using pattern '${pattern}' on exchange '${exchangeName}'. will return messages in 10 seconds`
    );

    // wait 10 seconds to get messages, and then return the received messages and close the channel
    setTimeout(async () => {
        await channel.close();
        res.json(receivedMessages);
    }, 10000);
});

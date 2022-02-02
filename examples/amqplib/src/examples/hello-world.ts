import { ConsumeMessage } from 'amqplib';
import express from 'express';
import { getConnection } from '../utils';

export const helloWorldRouter = express.Router();

helloWorldRouter.post('/:queueName', async (req: express.Request, res: express.Response) => {
    const queueName = req.params['queueName'];
    const channel = await getConnection().createChannel();
    await channel.assertQueue(queueName, { durable: false });
    const hadSpaceInBuffer = channel.sendToQueue(queueName, req.body ?? '');
    await channel.close();
    console.log(`Sent payload "${req.body}" to queue "${queueName}"`);
    res.json({ hadSpaceInBuffer });
});

helloWorldRouter.get('/:queueName', async (req: express.Request, res: express.Response) => {
    const queueName = req.params['queueName'];
    const channel = await getConnection().createChannel();
    await channel.assertQueue(queueName, { durable: false });

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
    console.log(`registered a consumer for queue ${queueName}. will return messages in 10 seconds`);

    // wait 10 seconds to get messages, and then return the received messages and close the channel
    setTimeout(async () => {
        await channel.close();
        res.json(receivedMessages);
    }, 10000);
});

import { ConsumeMessage } from 'amqplib';
import express from 'express';
import { getConnection } from '../utils';

export const publishSubscribeRouter = express.Router();

publishSubscribeRouter.post('/:exchangeName', async (req: express.Request, res: express.Response) => {
    const exchangeName = req.params['exchangeName'];
    const channel = await getConnection().createChannel();
    await channel.assertExchange(exchangeName, 'fanout', { durable: false });
    const hadSpaceInBuffer = channel.publish(exchangeName, '', Buffer.from(req.body));
    await channel.close();
    console.log(`Sent "${req.body}" to fanout exchange ${exchangeName}`);
    res.json({ hadSpaceInBuffer });
});

publishSubscribeRouter.get('/:exchangeName', async (req: express.Request, res: express.Response) => {
    const exchangeName = req.params['exchangeName'];
    const channel = await getConnection().createChannel();
    await channel.assertExchange(exchangeName, 'fanout', { durable: false });
    const { queue: queueName } = await channel.assertQueue('', { exclusive: true });
    await channel.bindQueue(queueName, exchangeName, '');

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
    console.log(`registered a consumer for temporary pub-sub queue ${queueName}. will return messages in 10 seconds`);

    // wait 10 seconds to get messages, and then return the received messages and close the channel
    setTimeout(async () => {
        await channel.close();
        res.json(receivedMessages);
    }, 10000);
});

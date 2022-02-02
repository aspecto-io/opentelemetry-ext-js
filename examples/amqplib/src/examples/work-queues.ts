import { ConsumeMessage } from 'amqplib';
import express from 'express';
import axios from 'axios';
import { getConnection } from '../utils';

export const workQueuesRouter = express.Router();

workQueuesRouter.post('/:queueName', async (req: express.Request, res: express.Response) => {
    const queueName = req.params['queueName'];
    const channel = await getConnection().createChannel();
    await channel.assertQueue(queueName, { durable: false });
    const hadSpaceInBuffer = channel.sendToQueue(queueName, Buffer.from(req.body), { persistent: true });
    await channel.close();
    console.log(`Sent work "${req.body}" to queue ${queueName}`);
    res.json({ hadSpaceInBuffer });
});

workQueuesRouter.get('/:queueName', async (req: express.Request, res: express.Response) => {
    const queueName = req.params['queueName'];
    const requeue = req.query['requeue'];
    const channel = await getConnection().createChannel();
    await channel.assertQueue(queueName, { durable: false });
    await channel.prefetch(1);

    let channelOpen = true;
    const receivedMessages: string[] = [];
    await channel.consume(queueName, async (msg: ConsumeMessage | null) => {
        if (!msg) return;
        
        const body = msg.content.toString();
        const secs = body.split('.').length - 1;
        // this is not in the examples
        // create outgoing http operation, to make sure the span has right context
        await axios.get('https://jsonplaceholder.typicode.com/todos/1');

        receivedMessages.push(`simulating a job taking ${secs} seconds`);
        setTimeout(function () {
            console.log(` [x] Done simulating work job taking ${secs} seconds`);

            if (channelOpen) {
                if (requeue === undefined) {
                    // ack success
                    channel.ack(msg);
                } else {
                    channel.nack(msg, undefined, requeue === 'true');
                }
            } else {
                console.log('message not acked since channel is already closed');
            }
        }, secs * 1000);
    });
    console.log(`registered a consumer for queue ${queueName}. will return messages in 10 seconds`);

    // wait 10 seconds to get messages, and then return the received messages and close the channel
    setTimeout(async () => {
        channelOpen = false;
        await channel.close();
        res.json(receivedMessages);
    }, 10000);
});

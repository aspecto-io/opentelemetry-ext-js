import type amqp from 'amqplib';
import type amqpCallback from 'amqplib/callback_api';

export const asyncConsume = (
    channel: amqp.Channel | amqpCallback.Channel,
    queueName: string,
    callback: ((msg: amqp.Message) => unknown)[],
    options?: amqp.Options.Consume
): Promise<amqp.Message[]> => {
    const msgs: amqp.Message[] = [];
    return new Promise((resolve) =>
        channel.consume(
            queueName,
            (msg) => {
                msgs.push(msg);
                try {
                    callback[msgs.length - 1]?.(msg);
                    if (msgs.length >= callback.length) {
                        setImmediate(() => resolve(msgs));
                    }
                } catch (err) {
                    setImmediate(() => resolve(msgs));
                    throw err;
                }
            },
            options
        )
    );
};

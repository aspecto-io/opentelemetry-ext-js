import amqp from 'amqplib';

let amqpConn: amqp.Connection;

export const connectToAmqp = async () => {
    try {
        const url = 'amqp://localhost';
        console.log(`attempting to connect to amqp server at '${url}'`);
        amqpConn = await amqp.connect(url);
        console.log(`connection to amqp server established`);
    } catch (err) {
        console.log('failed to connect to amqp server. make sure you have one running. run `yarn docker:start` to start it in docker container', err);
        throw err;
    }
};

export const getConnection = () => amqpConn;

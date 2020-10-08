# SQS
SQS is amazon's managed message queue. Thus, it should follow the [Open Telemetry specification for Messaging systems](https://github.com/open-telemetry/opentelemetry-specification/blob/master/specification/trace/semantic_conventions/messaging.md).

## Specific trace semantic
The following methods are automatically enhanced:

### sendMessage / sendMessageBatch
- [Messaging Attributes](https://github.com/open-telemetry/opentelemetry-specification/blob/master/specification/trace/semantic_conventions/messaging.md#messaging-attributes) are added by this plugin according to the spec.
- Open Telemetry trace context is injected as SQS MessageAttributes, so the service receiving the message can link cascading spans to the trace which created the message. 

### receiveMessage
- [Messaging Attributes](https://github.com/open-telemetry/opentelemetry-specification/blob/master/specification/trace/semantic_conventions/messaging.md#messaging-attributes) are added by this plugin according to the spec.
- Additional "processing spans" are created for each message received by the application.   
If an application invoked `receiveMessage`, and received a 10 messages batch, a single `messaging.operation` = `receive` span will be created for the `receiveMessage` operation, and 10 `messaging.operation` = `process` spans will be created, one for each message.  
Those processing spans are created by the library. This behavior is partially implemented, [See discussion below](#processing-spans).
- Sets the inter process context correctly, so that additional spans created through the process will be linked to parent spans correctly.  
This behavior is partially implemented, [See discussion below](#processing-spans).
- Extract trace context from SQS MessageAttributes, and set span's `parent` and `links` correctly according to the spec.

#### Processing Spans
According to open telemetry specification (and to reasonable expectation for trace structure), user of this library would expect to see one span for the operation of receiving messages batch from SQS, and then, **for each message**, a span with it's own sub-tree for the processing of this specific message. 

For example, if a `receiveMessages` returned 2 messages: 
* `msg1` resulting in storing something to a DB.
* `msg2` resulting in calling an external HTTP endpoint.  

This will result in a creating a DB span that would be the child of `msg1` process span, and an HTTP span that would be the child of `msg2` process span (in opposed to mixing all those operations under the single `receive` span, or start a new trace for each of them).

Unfortunately, this is not so easy to implement in JS:
1. The SDK is calling a single callback for the messages batch, and it's not straight forward to understand when each individual message processing starts and ends (and set the context correctly for cascading spans).
2. If async/await is used, context can be lost when returning data from async functions, for example:
```js
async function asyncRecv() {
  const data = await sqs.receiveMessage(recvParams).promise();
  // context of receiveMessage is set here
  return data;
}

async function poll() {
    const result = await asyncRecv();
    // context is lost when asyncRecv returns. following spans are created with root context.
    await Promise.all(result.Messages.map((message) => this.processMessage(message)));
}
```

Current implementation partially solves this issue by patching the `map` \ `forEach` \ `Filter` functions on the `Messages` array of `receiveMessage` result. This handles issues like the one above, but will not handle situations where the processing is done in other patterns (multiple map\forEach calls, index access to the array, other array operations, etc). This is currently an open issue in the plugin.

User can add custom attributes to the `process` span, by setting a function to `sqsProcessHook` in plugin config. For example:
```js
awsPluginConfig = {
  enabled: true,
  path: "opentelemetry-plugin-aws-sdk",
  sqsProcessHook: (span, message) => {
    span.setAttribute("sqs.receipt_handle", message.params?.ReceiptHandle);
  }
};
```


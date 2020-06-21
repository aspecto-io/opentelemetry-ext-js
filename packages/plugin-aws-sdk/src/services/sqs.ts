import { Attributes, Tracer, SpanKind, Span } from "@opentelemetry/api";
import { RequestMetadata } from "./service-attributes";

export enum SqsAttributeNames {
  // https://github.com/open-telemetry/opentelemetry-specification/blob/master/specification/trace/semantic_conventions/messaging.md
  MESSAGING_SYSTEM = "messaging.system",
  MESSAGING_DESTINATION = "messaging.destination",
  MESSAGING_DESTINATIONKIND = "messaging.destination_kind",
  MESSAGING_MESSAGE_ID = "messaging.message_id",
  MESSAGING_OPERATION = "messaging.operation",
  MESSAGING_URL = "messaging.url",
}

export const START_SPAN_FUNCTION = Symbol(
  "opentelemetry.plugin.aws-sdk.start_span"
);

export const END_SPAN_FUNCTION = Symbol(
  "opentelemetry.plugin.aws-sdk.end_span"
);

function extractQueueUrl(request: AWS.Request<any, any>): string {
  return (request as any)?.params?.QueueUrl;
}

function extractQueueNameFromUrl(queueUrl: string): string {
  if (!queueUrl) return undefined;

  const pisces = queueUrl.split("/");
  if (pisces.length === 0) return undefined;

  return pisces[pisces.length - 1];
}

function startSingleMessageSpan(
  tracer: Tracer,
  queueUrl: string,
  queueName: string,
  message: AWS.SQS.Message
): Span {
  const messageSpan = tracer.startSpan(queueName, {
    kind: SpanKind.CONSUMER,
    attributes: {
      [SqsAttributeNames.MESSAGING_SYSTEM]: "aws.sqs",
      [SqsAttributeNames.MESSAGING_DESTINATION]: queueName,
      [SqsAttributeNames.MESSAGING_DESTINATIONKIND]: "queue",
      [SqsAttributeNames.MESSAGING_MESSAGE_ID]: message.MessageId,
      [SqsAttributeNames.MESSAGING_URL]: queueUrl,
      [SqsAttributeNames.MESSAGING_OPERATION]: "process",
    },
  });

  message[START_SPAN_FUNCTION] = () =>
    console.log(
      "open-telemetry aws-sdk plugin: trying to start sqs processing span twice."
    );
  message[END_SPAN_FUNCTION] = () => {
    messageSpan.end();
    message[END_SPAN_FUNCTION] = () =>
      console.log(
        "open-telemetry aws-sdk plugin: trying to end sqs processing span which was already ended."
      );
  };
  return messageSpan;
}

function patchArrayFunction(
  messages: AWS.SQS.Message[],
  functionName: string,
  tracer: Tracer
) {
  const origFunc = messages[functionName];
  messages[functionName] = function (callback) {
    return origFunc.call(this, function (message: AWS.SQS.Message) {
      const messageSpan = message[START_SPAN_FUNCTION]();
      tracer.withSpan(messageSpan, () => callback.apply(this, arguments));
      message[END_SPAN_FUNCTION]();
    });
  };
}

export function getSqsRequestSpanAttributes(
  request: AWS.Request<any, any>
): RequestMetadata {
  const queueUrl = extractQueueUrl(request);
  const queueName = extractQueueNameFromUrl(queueUrl);

  let isIncoming = false;
  const attributes = {
    [SqsAttributeNames.MESSAGING_SYSTEM]: "aws.sqs",
    [SqsAttributeNames.MESSAGING_DESTINATIONKIND]: "queue",
    [SqsAttributeNames.MESSAGING_DESTINATION]: queueName,
    [SqsAttributeNames.MESSAGING_URL]: queueUrl,
  };

  const operation = (request as any)?.operation;
  switch (operation) {
    case "receiveMessage":
      isIncoming = true;
      attributes[SqsAttributeNames.MESSAGING_OPERATION] = "receive";
      break;
  }

  return {
    attributes,
    isIncoming,
  };
}

export function getSqsResponseSpanAttributes(
  response: AWS.Response<any, any>,
  tracer: Tracer
): Attributes {
  const messages: AWS.SQS.Message[] = response.data.Messages;
  if (messages) {
    const queueUrl = extractQueueUrl((response as any)?.request);
    const queueName = extractQueueNameFromUrl(queueUrl);

    messages.forEach((message: AWS.SQS.Message) => {
      message[START_SPAN_FUNCTION] = () =>
        startSingleMessageSpan(tracer, queueUrl, queueName, message);
      message[END_SPAN_FUNCTION] = () =>
        console.log(
          "open-telemetry aws-sdk plugin: end span called on sqs message which was not started"
        );
    });

    patchArrayFunction(messages, "forEach", tracer);
    patchArrayFunction(messages, "map", tracer);
  }
  return {};
}

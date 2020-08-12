import {
  Tracer,
  SpanKind,
  Span,
  propagation,
  Context,
  Link,
  Logger,
} from "@opentelemetry/api";
import { RequestMetadata, ServiceExtension } from "./ServiceExtension";
import * as AWS from "aws-sdk";
import {
  getExtractedSpanContext,
  TRACE_PARENT_HEADER,
} from "@opentelemetry/core";
import {
  MessageBodyAttributeMap,
  SendMessageRequest,
  SendMessageBatchRequest,
  SendMessageBatchRequestEntry,
} from "aws-sdk/clients/sqs";

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
  "opentelemetry.plugin.aws-sdk.sqs.start_span"
);

export const END_SPAN_FUNCTION = Symbol(
  "opentelemetry.plugin.aws-sdk.sqs.end_span"
);

// https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-quotas.html
const SQS_MAX_MESSAGE_ATTRIBUTES = 10;

const contextSetterFunc = (
  messageAttributes: AWS.SQS.MessageBodyAttributeMap,
  key: string,
  value: unknown
) => {
  messageAttributes[key] = {
    DataType: "String",
    StringValue: value as string,
  };
};

const contextGetterFunc = (
  messageAttributes: AWS.SQS.MessageBodyAttributeMap,
  key: string
) => {
  return messageAttributes?.[key]?.StringValue;
};

export class SqsServiceExtension implements ServiceExtension {
  tracer: Tracer;
  logger: Logger;

  constructor(tracer: Tracer, logger: Logger) {
    this.tracer = tracer;
    this.logger = logger;
  }

  requestHook(request: AWS.Request<any, any>): RequestMetadata {
    const queueUrl = this.extractQueueUrl(request);
    const queueName = this.extractQueueNameFromUrl(queueUrl);
    let spanKind: SpanKind = SpanKind.CLIENT;
    let spanName: string;

    const spanAttributes = {
      [SqsAttributeNames.MESSAGING_SYSTEM]: "aws.sqs",
      [SqsAttributeNames.MESSAGING_DESTINATIONKIND]: "queue",
      [SqsAttributeNames.MESSAGING_DESTINATION]: queueName,
      [SqsAttributeNames.MESSAGING_URL]: queueUrl,
    };

    let isIncoming = false;

    const operation = (request as any)?.operation;
    switch (operation) {
      case "receiveMessage":
        {
          isIncoming = true;
          spanKind = SpanKind.CONSUMER;
          spanName = `${queueName} receive`;
          spanAttributes[SqsAttributeNames.MESSAGING_OPERATION] = "receive";

          const params: Record<string, any> = (request as any).params;
          const attributesNames = params.MessageAttributeNames || [];
          attributesNames.push(TRACE_PARENT_HEADER);
          params.MessageAttributeNames = attributesNames;
        }
        break;

      case "sendMessage":
      case "sendMessageBatch":
        spanKind = SpanKind.PRODUCER;
        spanName = `${queueName} send`;
        break;
    }

    return {
      isIncoming,
      spanAttributes,
      spanKind,
      spanName,
    };
  }

  requestPostSpanHook = (request: AWS.Request<any, any>) => {
    const operation = (request as any)?.operation;
    switch (operation) {
      case "sendMessage":
        {
          const params: SendMessageRequest = (request as any).params;
          params.MessageAttributes = this.InjectPropagationContext(
            params.MessageAttributes
          );
        }
        break;

      case "sendMessageBatch":
        {
          const params: SendMessageBatchRequest = (request as any).params;
          params.Entries.forEach(
            (messageParams: SendMessageBatchRequestEntry) => {
              messageParams.MessageAttributes = this.InjectPropagationContext(
                messageParams.MessageAttributes
              );
            }
          );
        }
        break;
    }
  };

  responseHook = (response: AWS.Response<any, any>, span: Span) => {
    const messages: AWS.SQS.Message[] = response?.data?.Messages;
    if (messages) {
      const queueUrl = this.extractQueueUrl((response as any)?.request);
      const queueName = this.extractQueueNameFromUrl(queueUrl);

      messages.forEach((message: AWS.SQS.Message) => {
        const parentContext: Context = propagation.extract(
          message.MessageAttributes,
          contextGetterFunc
        );
        message[START_SPAN_FUNCTION] = () => {
          return this.tracer.withSpan(span, () =>
            this.startSingleMessageSpan(
              queueUrl,
              queueName,
              message,
              parentContext
            )
          );
        };
        message[END_SPAN_FUNCTION] = () =>
          console.log(
            "open-telemetry aws-sdk plugin: end span called on sqs message which was not started"
          );
      });

      this.patchArrayFunction(messages, "forEach");
      this.patchArrayFunction(messages, "map");
    }
  };

  extractQueueUrl = (request: AWS.Request<any, any>): string => {
    return (request as any)?.params?.QueueUrl;
  };

  extractQueueNameFromUrl = (queueUrl: string): string => {
    if (!queueUrl) return undefined;

    const pisces = queueUrl.split("/");
    if (pisces.length === 0) return undefined;

    return pisces[pisces.length - 1];
  };

  startSingleMessageSpan(
    queueUrl: string,
    queueName: string,
    message: AWS.SQS.Message,
    propagtedContext: Context
  ): Span {
    const links: Link[] = [];
    if (propagtedContext) {
      links.push({
        context: getExtractedSpanContext(propagtedContext),
      } as Link);
    }

    const spanName = `${queueName} process`;
    const messageSpan = this.tracer.startSpan(spanName, {
      kind: SpanKind.CONSUMER,
      attributes: {
        [SqsAttributeNames.MESSAGING_SYSTEM]: "aws.sqs",
        [SqsAttributeNames.MESSAGING_DESTINATION]: queueName,
        [SqsAttributeNames.MESSAGING_DESTINATIONKIND]: "queue",
        [SqsAttributeNames.MESSAGING_MESSAGE_ID]: message.MessageId,
        [SqsAttributeNames.MESSAGING_URL]: queueUrl,
        [SqsAttributeNames.MESSAGING_OPERATION]: "process",
      },
      links,
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

  patchArrayFunction(messages: AWS.SQS.Message[], functionName: string) {
    const self = this;
    const origFunc = messages[functionName];
    messages[functionName] = function (callback) {
      return origFunc.call(this, function (message: AWS.SQS.Message) {
        const messageSpan = message[START_SPAN_FUNCTION]();
        const res = self.tracer.withSpan(messageSpan, () =>
          callback.apply(this, arguments)
        );
        message[END_SPAN_FUNCTION]();
        return res;
      });
    };
  }

  InjectPropagationContext(
    attributesMap?: MessageBodyAttributeMap
  ): MessageBodyAttributeMap {
    const attributes = attributesMap ?? {};
    if (Object.keys(attributes).length < SQS_MAX_MESSAGE_ATTRIBUTES) {
      propagation.inject(attributes, contextSetterFunc);
    } else {
      this.logger.warn(
        "OpenTelemetry aws-sdk plugin cannot set context propagation on SQS message due to maximum amount of MessageAttributes"
      );
    }
    return attributes;
  }
}

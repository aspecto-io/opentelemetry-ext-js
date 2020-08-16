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
  setActiveSpan,
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
        const extractedParentContext: Context = propagation.extract(
          message.MessageAttributes,
          contextGetterFunc
        );
        message[START_SPAN_FUNCTION] = () =>
          this.startMessagingProcessSpan(
            queueUrl,
            queueName,
            message,
            span,
            extractedParentContext
          );
        message[END_SPAN_FUNCTION] = () =>
          console.log(
            "open-telemetry aws-sdk plugin: end span called on sqs message which was not started"
          );
      });

      this.patchArrayForProcessSpans(messages);
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

  startMessagingProcessSpan(
    queueUrl: string,
    queueName: string,
    message: AWS.SQS.Message,
    receiveMessageSpan: Span,
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
      parent: receiveMessageSpan,
    });

    message[START_SPAN_FUNCTION] = () => messageSpan;
    message[END_SPAN_FUNCTION] = () => {
      messageSpan.end();
      message[END_SPAN_FUNCTION] = () => {};
    };
    return messageSpan;
  }

  patchArrayForProcessSpans(messages: any[]) {
    this.patchArrayFunction(messages, "forEach");
    this.patchArrayFunction(messages, "map");
    this.patchArrayFilter(messages);
    // this.patchArrayIterators(messages, 'values');
    // this.patchArrayIterators(messages, Symbol.iterator);
  }

  // the following implementation relays on the fact that
  // an array element processing is done once the iterator is accessed again.
  // it fails in case of throw\return\break from the loop body which cause
  // context manager data structure to be broken
  //
  // patchArrayIterators(messages: any[], functionName: any) {
  //   const self = this;

  //   const contextManager = context["_getContextManager"]?.();
  //   const enterContext = contextManager?.["_enterContext"]?.bind(contextManager);
  //   const exitContext = contextManager?.["_exitContext"]?.bind(contextManager);
  //   if(!enterContext || !exitContext) return;

  //   let activeMessage: any;

  //   const origFunc = messages[functionName];
  //   messages[functionName] = function (...args: unknown[]) {
  //     const iterator: IterableIterator<unknown> = origFunc.apply(
  //       this,
  //       arguments
  //     );
  //     const iteratorNext = iterator.next;
  //     iterator.next = function (...args: unknown[]) {
  //       const iteratorNextResult = iteratorNext.apply(this, arguments);
  //       if(activeMessage) {
  //         exitContext();
  //         activeMessage?.[END_SPAN_FUNCTION]?.();
  //       }
  //       const messageSpan = iteratorNextResult.value?.[START_SPAN_FUNCTION]?.();
  //       if(messageSpan) {
  //         enterContext(setActiveSpan(context.active(), messageSpan));
  //         activeMessage = iteratorNextResult.value;
  //       }
  //       return iteratorNextResult;
  //     };
  //     return iterator;
  //   };
  // }

  patchArrayFilter(messages: any[]) {
    const self = this;
    const origFunc = messages.filter;
    messages.filter = function (...args) {
      const newArray = origFunc.apply(this, arguments);
      self.patchArrayForProcessSpans(newArray);
      return newArray;
    };
  }

  patchArrayFunction(messages: any[], functionName: string) {
    const self = this;
    const origFunc = messages[functionName];
    messages[functionName] = function (callback, thisArg) {
      const wrappedCallback = function (message: AWS.SQS.Message) {
        const messageSpan = message[START_SPAN_FUNCTION]();
        const res = self.tracer.withSpan(messageSpan, () => {
          try {
            return callback.apply(this, arguments);
          } catch (err) {
            throw err;
          } finally {
            message[END_SPAN_FUNCTION]();
          }
        });
        if (res) {
          res[START_SPAN_FUNCTION] = message[START_SPAN_FUNCTION];
          res[END_SPAN_FUNCTION] = message[END_SPAN_FUNCTION];
        }
        return res;
      };
      const funcResult = origFunc.call(this, wrappedCallback, thisArg);
      if (Array.isArray(funcResult)) self.patchArrayForProcessSpans(funcResult);
      return funcResult;
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

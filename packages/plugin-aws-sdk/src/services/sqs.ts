import {
    Tracer,
    SpanKind,
    Span,
    propagation,
    Logger,
    TextMapGetter,
    TextMapSetter,
    setSpan,
    context,
    ROOT_CONTEXT,
} from '@opentelemetry/api';
import { pubsubPropagation } from 'opentelemetry-propagation-utils';
import { RequestMetadata, ServiceExtension } from './ServiceExtension';
import * as AWS from 'aws-sdk';
import {
    MessageBodyAttributeMap,
    SendMessageRequest,
    SendMessageBatchRequest,
    SendMessageBatchRequestEntry,
} from 'aws-sdk/clients/sqs';
import { AwsSdkSqsProcessCustomAttributeFunction } from '../types';

export enum SqsAttributeNames {
    // https://github.com/open-telemetry/opentelemetry-specification/blob/master/specification/trace/semantic_conventions/messaging.md
    MESSAGING_SYSTEM = 'messaging.system',
    MESSAGING_DESTINATION = 'messaging.destination',
    MESSAGING_DESTINATIONKIND = 'messaging.destination_kind',
    MESSAGING_MESSAGE_ID = 'messaging.message_id',
    MESSAGING_OPERATION = 'messaging.operation',
    MESSAGING_URL = 'messaging.url',
}

export const START_SPAN_FUNCTION = Symbol('opentelemetry.plugin.aws-sdk.sqs.start_span');

export const END_SPAN_FUNCTION = Symbol('opentelemetry.plugin.aws-sdk.sqs.end_span');

// https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-quotas.html
const SQS_MAX_MESSAGE_ATTRIBUTES = 10;
class SqsContextSetter implements TextMapSetter<AWS.SQS.MessageBodyAttributeMap> {
    set(carrier: AWS.SQS.MessageBodyAttributeMap, key: string, value: string) {
        carrier[key] = {
            DataType: 'String',
            StringValue: value as string,
        };
    }
}
const sqsContextSetter = new SqsContextSetter();

class SqsContextGetter implements TextMapGetter<AWS.SQS.MessageBodyAttributeMap> {
    keys(carrier: AWS.SQS.MessageBodyAttributeMap): string[] {
        return Object.keys(carrier);
    }

    get(carrier: AWS.SQS.MessageBodyAttributeMap, key: string): string | string[] {
        return carrier?.[key]?.StringValue;
    }
}
const sqsContextGetter = new SqsContextGetter();

export class SqsServiceExtension implements ServiceExtension {
    constructor(
        private tracer: Tracer,
        private logger: Logger,
        private sqsProcessHook: AwsSdkSqsProcessCustomAttributeFunction
    ) {}

    requestHook(request: AWS.Request<any, any>): RequestMetadata {
        const queueUrl = this.extractQueueUrl(request);
        const queueName = this.extractQueueNameFromUrl(queueUrl);
        let spanKind: SpanKind = SpanKind.CLIENT;
        let spanName: string;

        const spanAttributes = {
            [SqsAttributeNames.MESSAGING_SYSTEM]: 'aws.sqs',
            [SqsAttributeNames.MESSAGING_DESTINATIONKIND]: 'queue',
            [SqsAttributeNames.MESSAGING_DESTINATION]: queueName,
            [SqsAttributeNames.MESSAGING_URL]: queueUrl,
        };

        let isIncoming = false;

        const operation = (request as any)?.operation;
        switch (operation) {
            case 'receiveMessage':
                {
                    isIncoming = true;
                    spanKind = SpanKind.CONSUMER;
                    spanName = `${queueName} receive`;
                    spanAttributes[SqsAttributeNames.MESSAGING_OPERATION] = 'receive';

                    const params: Record<string, any> = (request as any).params;
                    params.MessageAttributeNames = (params.MessageAttributeNames ?? []).concat(propagation.fields());
                }
                break;

            case 'sendMessage':
            case 'sendMessageBatch':
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
            case 'sendMessage':
                {
                    const params: SendMessageRequest = (request as any).params;
                    params.MessageAttributes = this.InjectPropagationContext(params.MessageAttributes);
                }
                break;

            case 'sendMessageBatch':
                {
                    const params: SendMessageBatchRequest = (request as any).params;
                    params.Entries.forEach((messageParams: SendMessageBatchRequestEntry) => {
                        messageParams.MessageAttributes = this.InjectPropagationContext(
                            messageParams.MessageAttributes
                        );
                    });
                }
                break;
        }
    };

    responseHook = (response: AWS.Response<any, any>, span: Span) => {
        const messages: AWS.SQS.Message[] = response?.data?.Messages;
        if (messages) {
            const queueUrl = this.extractQueueUrl((response as any)?.request);
            const queueName = this.extractQueueNameFromUrl(queueUrl);

            pubsubPropagation.patchMessagesArrayToStartProcessSpans<AWS.SQS.Message>({
                messages,
                parentContext: setSpan(context.active(), span),
                tracer: this.tracer,
                messageToSpanDetails: (message: AWS.SQS.Message) => ({
                    name: queueName,
                    parentContext: propagation.extract(ROOT_CONTEXT, message.MessageAttributes, sqsContextGetter),
                    attributes: {
                        [SqsAttributeNames.MESSAGING_SYSTEM]: 'aws.sqs',
                        [SqsAttributeNames.MESSAGING_DESTINATION]: queueName,
                        [SqsAttributeNames.MESSAGING_DESTINATIONKIND]: 'queue',
                        [SqsAttributeNames.MESSAGING_MESSAGE_ID]: message.MessageId,
                        [SqsAttributeNames.MESSAGING_URL]: queueUrl,
                        [SqsAttributeNames.MESSAGING_OPERATION]: 'process',
                    },
                }),
                processHook: (span: Span, message: AWS.SQS.Message) =>
                    this.sqsProcessHook ? this.sqsProcessHook(span, message) : {},
            });

            pubsubPropagation.patchArrayForProcessSpans(messages, this.tracer);
        }
    };

    extractQueueUrl = (request: AWS.Request<any, any>): string => {
        return (request as any)?.params?.QueueUrl;
    };

    extractQueueNameFromUrl = (queueUrl: string): string => {
        if (!queueUrl) return undefined;

        const segments = queueUrl.split('/');
        if (segments.length === 0) return undefined;

        return segments[segments.length - 1];
    };

    InjectPropagationContext(attributesMap?: MessageBodyAttributeMap): MessageBodyAttributeMap {
        const attributes = attributesMap ?? {};
        if (Object.keys(attributes).length < SQS_MAX_MESSAGE_ATTRIBUTES) {
            propagation.inject(context.active(), attributes, sqsContextSetter);
        } else {
            this.logger.warn(
                'OpenTelemetry aws-sdk plugin cannot set context propagation on SQS message due to maximum amount of MessageAttributes'
            );
        }
        return attributes;
    }
}

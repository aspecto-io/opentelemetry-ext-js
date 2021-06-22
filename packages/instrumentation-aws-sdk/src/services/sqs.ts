import {
    Tracer,
    SpanKind,
    Span,
    propagation,
    diag,
    TextMapGetter,
    TextMapSetter,
    trace,
    context,
    ROOT_CONTEXT,
} from '@opentelemetry/api';
import { pubsubPropagation } from 'opentelemetry-propagation-utils';
import { RequestMetadata, ServiceExtension } from './ServiceExtension';
import type { SQS } from 'aws-sdk';
import { AwsSdkInstrumentationConfig, NormalizedRequest, NormalizedResponse } from '../types';
import { MessagingDestinationKindValues, SemanticAttributes } from '@opentelemetry/semantic-conventions';

export const START_SPAN_FUNCTION = Symbol('opentelemetry.instrumentation.aws-sdk.sqs.start_span');

export const END_SPAN_FUNCTION = Symbol('opentelemetry.instrumentation.aws-sdk.sqs.end_span');

// https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-quotas.html
const SQS_MAX_MESSAGE_ATTRIBUTES = 10;
class SqsContextSetter implements TextMapSetter<SQS.MessageBodyAttributeMap> {
    set(carrier: SQS.MessageBodyAttributeMap, key: string, value: string) {
        carrier[key] = {
            DataType: 'String',
            StringValue: value as string,
        };
    }
}
const sqsContextSetter = new SqsContextSetter();

class SqsContextGetter implements TextMapGetter<SQS.MessageBodyAttributeMap> {
    keys(carrier: SQS.MessageBodyAttributeMap): string[] {
        return Object.keys(carrier);
    }

    get(carrier: SQS.MessageBodyAttributeMap, key: string): string | string[] {
        return carrier?.[key]?.StringValue;
    }
}
const sqsContextGetter = new SqsContextGetter();

export class SqsServiceExtension implements ServiceExtension {
    requestPreSpanHook(request: NormalizedRequest): RequestMetadata {
        const queueUrl = this.extractQueueUrl(request.commandInput);
        const queueName = this.extractQueueNameFromUrl(queueUrl);
        let spanKind: SpanKind = SpanKind.CLIENT;
        let spanName: string;

        const spanAttributes = {
            [SemanticAttributes.MESSAGING_SYSTEM]: 'aws.sqs',
            [SemanticAttributes.MESSAGING_DESTINATION_KIND]: MessagingDestinationKindValues.QUEUE,
            [SemanticAttributes.MESSAGING_DESTINATION]: queueName,
            [SemanticAttributes.MESSAGING_URL]: queueUrl,
        };

        let isIncoming = false;

        switch (request.commandName) {
            case 'receiveMessage':
                {
                    isIncoming = true;
                    spanKind = SpanKind.CONSUMER;
                    spanName = `${queueName} receive`;
                    spanAttributes[SemanticAttributes.MESSAGING_OPERATION] = 'receive';

                    request.commandInput.MessageAttributeNames = (
                        request.commandInput.MessageAttributeNames ?? []
                    ).concat(propagation.fields());
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

    requestPostSpanHook = (request: NormalizedRequest) => {
        switch (request.commandName) {
            case 'sendMessage':
                {
                    const origMessageAttributes = request.commandInput['MessageAttributes'] ?? {};
                    if (origMessageAttributes) {
                        request.commandInput['MessageAttributes'] =
                            this.InjectPropagationContext(origMessageAttributes);
                    }
                }
                break;

            case 'sendMessageBatch':
                {
                    request.commandInput?.Entries?.forEach((messageParams: SQS.SendMessageBatchRequestEntry) => {
                        messageParams.MessageAttributes = this.InjectPropagationContext(
                            messageParams.MessageAttributes ?? {}
                        );
                    });
                }
                break;
        }
    };

    responseHook = (response: NormalizedResponse, span: Span, tracer: Tracer, config: AwsSdkInstrumentationConfig) => {
        const messages: SQS.Message[] = response?.data?.Messages;
        if (messages) {
            const queueUrl = this.extractQueueUrl(response.request.commandInput);
            const queueName = this.extractQueueNameFromUrl(queueUrl);

            pubsubPropagation.patchMessagesArrayToStartProcessSpans<SQS.Message>({
                messages,
                parentContext: trace.setSpan(context.active(), span),
                tracer,
                messageToSpanDetails: (message: SQS.Message) => ({
                    name: queueName,
                    parentContext: propagation.extract(ROOT_CONTEXT, message.MessageAttributes, sqsContextGetter),
                    attributes: {
                        [SemanticAttributes.MESSAGING_SYSTEM]: 'aws.sqs',
                        [SemanticAttributes.MESSAGING_DESTINATION]: queueName,
                        [SemanticAttributes.MESSAGING_DESTINATION_KIND]: MessagingDestinationKindValues.QUEUE,
                        [SemanticAttributes.MESSAGING_MESSAGE_ID]: message.MessageId,
                        [SemanticAttributes.MESSAGING_URL]: queueUrl,
                        [SemanticAttributes.MESSAGING_OPERATION]: 'process',
                    },
                }),
                processHook: (span: Span, message: SQS.Message) => config.sqsProcessHook?.(span, message),
            });

            pubsubPropagation.patchArrayForProcessSpans(messages, tracer, context.active());
        }
    };

    extractQueueUrl = (commandInput: Record<string, any>): string => {
        return commandInput?.QueueUrl;
    };

    extractQueueNameFromUrl = (queueUrl: string): string => {
        if (!queueUrl) return undefined;

        const segments = queueUrl.split('/');
        if (segments.length === 0) return undefined;

        return segments[segments.length - 1];
    };

    InjectPropagationContext(attributesMap?: SQS.MessageBodyAttributeMap): SQS.MessageBodyAttributeMap {
        const attributes = attributesMap ?? {};
        if (Object.keys(attributes).length < SQS_MAX_MESSAGE_ATTRIBUTES) {
            propagation.inject(context.active(), attributes, sqsContextSetter);
        } else {
            diag.warn(
                'aws-sdk instrumentation: cannot set context propagation on SQS message due to maximum amount of MessageAttributes'
            );
        }
        return attributes;
    }
}

import { PluginConfig, Span } from '@opentelemetry/api';
import AWS from 'aws-sdk';

export interface AwsSdkRequestCustomAttributeFunction {
    (span: Span, request: AWS.Request<any, any>): void;
}

export interface AwsSdkSqsProcessCustomAttributeFunction {
    (span: Span, message: AWS.SQS.Message): void;
}

export interface AwsSdkPluginConfig extends PluginConfig {
    /** hook for adding custom attributes before producer message is sent */
    preRequestHook?: AwsSdkRequestCustomAttributeFunction;

    /** hook for adding custom attribute when an sqs process span is started */
    sqsProcessHook?: AwsSdkSqsProcessCustomAttributeFunction;
}

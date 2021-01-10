import { Span } from '@opentelemetry/api';
import { PluginConfig } from '@opentelemetry/core';
import AWS from 'aws-sdk';

export interface AwsSdkRequestCustomAttributeFunction {
    (span: Span, request: AWS.Request<any, any>): void;
}

export interface AwsSdkResponseCustomAttributeFunction {
    (span: Span, response: AWS.Response<any, any>): void;
}

export interface AwsSdkSqsProcessCustomAttributeFunction {
    (span: Span, message: AWS.SQS.Message): void;
}

export interface AwsSdkPluginConfig extends PluginConfig {
    /** hook for adding custom attributes before request is sent to aws */
    preRequestHook?: AwsSdkRequestCustomAttributeFunction;

    /** hook for adding custom attributes when response is received from aws */
    responseHook?: AwsSdkResponseCustomAttributeFunction;

    /** hook for adding custom attribute when an sqs process span is started */
    sqsProcessHook?: AwsSdkSqsProcessCustomAttributeFunction;
}

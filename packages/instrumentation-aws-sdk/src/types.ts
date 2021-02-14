import { Span } from '@opentelemetry/api';
import { InstrumentationConfig } from '@opentelemetry/instrumentation';
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

export interface AwsSdkInstrumentationConfig extends InstrumentationConfig {
    /** hook for adding custom attributes before request is sent to aws */
    preRequestHook?: AwsSdkRequestCustomAttributeFunction;

    /** hook for adding custom attributes when response is received from aws */
    responseHook?: AwsSdkResponseCustomAttributeFunction;

    /** hook for adding custom attribute when an sqs process span is started */
    sqsProcessHook?: AwsSdkSqsProcessCustomAttributeFunction;

    /**
     * Most aws operation use http request under the hood.
     * if http instrumentation is enabled, each aws operation will also create
     * an http/s child describing the communication with amazon servers.
     * Setting the `suppressInternalInstrumentation` config value to `true` will
     * cause the instrumentation to suppress instrumentation of underlying operations,
     * effectively causing those http spans to be non-recordable.
     */
    suppressInternalInstrumentation?: boolean;
}

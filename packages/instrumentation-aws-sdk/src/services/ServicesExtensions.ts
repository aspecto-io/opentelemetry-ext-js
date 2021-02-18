import { Tracer, Span } from '@opentelemetry/api';
import { ServiceExtension, RequestMetadata } from './ServiceExtension';
import { SqsServiceExtension } from './sqs';
import * as AWS from 'aws-sdk';
import { AwsSdkInstrumentationConfig } from '../types';
import { DynamodbServiceExtension } from './dynamodb';

export class ServicesExtensions implements ServiceExtension {
    services: Map<string, ServiceExtension> = new Map();

    constructor(tracer: Tracer, instrumentationConfig: AwsSdkInstrumentationConfig) {
        this.services.set('sqs', new SqsServiceExtension(tracer, instrumentationConfig?.sqsProcessHook));
        this.services.set('dynamodb', new DynamodbServiceExtension());
    }

    requestHook(request: AWS.Request<any, any>): RequestMetadata {
        const serviceId = (request as any)?.service?.serviceIdentifier;
        const serviceExtension = this.services.get(serviceId);
        if (!serviceExtension)
            return {
                isIncoming: false,
            };
        return serviceExtension.requestHook(request);
    }

    requestPostSpanHook(request: AWS.Request<any, any>) {
        const serviceId = (request as any)?.service?.serviceIdentifier;
        const serviceExtension = this.services.get(serviceId);
        if (!serviceExtension?.requestPostSpanHook) return;
        return serviceExtension.requestPostSpanHook(request);
    }

    responseHook(response: AWS.Response<any, any>, span: Span) {
        const serviceId = (response as any)?.request?.service?.serviceIdentifier;
        const serviceExtension = this.services.get(serviceId);
        serviceExtension?.responseHook?.(response, span);
    }
}

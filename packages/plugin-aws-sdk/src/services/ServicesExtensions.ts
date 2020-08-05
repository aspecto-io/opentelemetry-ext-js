import { Tracer, Span, Logger } from "@opentelemetry/api";
import { ServiceExtension, RequestMetadata } from "./ServiceExtension";
import { SqsServiceExtension } from "./sqs";
import * as AWS from "aws-sdk";

export class ServicesExtensions implements ServiceExtension {
  services: Map<string, ServiceExtension> = new Map();

  constructor(tracer: Tracer, logger: Logger) {
    this.services.set("sqs", new SqsServiceExtension(tracer, logger));
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

  responseHook(response: AWS.Response<any, any>, span: Span) {
    const serviceId = (response as any)?.request?.service?.serviceIdentifier;
    const serviceExtension = this.services.get(serviceId);
    if (!serviceExtension) return;
    serviceExtension.responseHook(response, span);
  }
}

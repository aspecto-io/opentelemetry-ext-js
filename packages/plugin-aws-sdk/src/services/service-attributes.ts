import { Attributes, Tracer, Span } from "@opentelemetry/api";
import { getS3RequestSpanAttributes, getS3ResponseSpanAttributes } from "./s3";
import {
  getSqsRequestSpanAttributes,
  getSqsResponseSpanAttributes,
} from "./sqs";

/*
isIncoming - if true, then the operation callback / promise should be bind with the operation's span 
*/
export interface RequestMetadata {
  isIncoming: boolean;
}

type RequestAttrProcessor = (
  request: AWS.Request<any, any>,
  span: Span
) => RequestMetadata;
type ResponseAttrProcessor = (
  response: AWS.Response<any, any>,
  span: Span,
  tracer: Tracer
) => void;

class ServiceAttributes {
  public attributeProcessors: {
    [key: string]: {
      request: RequestAttrProcessor;
      response: ResponseAttrProcessor;
    };
  } = {};

  public addAttributeProcessor = (
    serviceId: string,
    requestProcessor: RequestAttrProcessor,
    responseProcessor: ResponseAttrProcessor
  ) => {
    this.attributeProcessors[serviceId] = {
      request: requestProcessor,
      response: responseProcessor,
    };
  };
}

export function getRequestServiceAttributes(
  request: AWS.Request<any, any>,
  span: Span
): RequestMetadata {
  const serviceId = (request as any)?.service?.serviceIdentifier;
  if (serviceId) {
    return serviceAttributes.attributeProcessors[serviceId]?.request(
      request,
      span
    );
  }
}

export function getResponseServiceAttributes(
  response: AWS.Response<any, any>,
  span: Span,
  tracer: Tracer
): void {
  const serviceId = (response as any)?.request?.service?.serviceIdentifier;
  if (!serviceId) return;

  return serviceAttributes.attributeProcessors[serviceId]?.response(
    response,
    span,
    tracer
  );
}

export const serviceAttributes = new ServiceAttributes();

serviceAttributes.addAttributeProcessor(
  "s3",
  getS3RequestSpanAttributes,
  getS3ResponseSpanAttributes
);

serviceAttributes.addAttributeProcessor(
  "sqs",
  getSqsRequestSpanAttributes,
  getSqsResponseSpanAttributes
);

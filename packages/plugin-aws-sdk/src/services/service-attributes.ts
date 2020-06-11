import { Attributes } from "@opentelemetry/api";
import { getS3RequestSpanAttributes, getS3ResponseSpanAttributes } from "./s3";

type RequestAttrProcessor = (request: AWS.Request<any, any>) => Attributes;
type ResponseAttrProcessor = (response: AWS.Response<any, any>) => Attributes;

class ServiceAttributes {
  public attributeProcessors: {
    [key: string]: {
      request: RequestAttrProcessor;
      response: ResponseAttrProcessor;
    };
  } = {};

  public initAttributeProcessor = (
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
  request: AWS.Request<any, any>
): Attributes {
  const serviceId = (request as any)?.service?.serviceIdentifier;
  if (serviceId) {
    return serviceAttributes.attributeProcessors[serviceId]?.request(request);
  }
}

export function getResponseServiceAttributes(
  response: AWS.Response<any, any>
): Attributes {
  const serviceId = (response as any)?.request?.service?.serviceIdentifier;
  if (serviceId) {
    return serviceAttributes.attributeProcessors[serviceId]?.response(response);
  }
}

export const serviceAttributes = new ServiceAttributes();

serviceAttributes.initAttributeProcessor(
  "s3",
  getS3RequestSpanAttributes,
  getS3ResponseSpanAttributes
);

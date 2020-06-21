import { Attributes, Span } from "@opentelemetry/api";
import { RequestMetadata } from "./service-attributes";

export function getS3RequestSpanAttributes(
  request: AWS.Request<any, any>,
  span: Span
): RequestMetadata {
  return {
    attributes: {},
    isIncoming: false,
  };
}

export function getS3ResponseSpanAttributes(
  response: AWS.Response<any, any>,
  span: Span
): Attributes {
  return {};
}

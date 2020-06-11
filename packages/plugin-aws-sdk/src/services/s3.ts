import { Attributes } from "@opentelemetry/api";

export function getS3RequestSpanAttributes(
  request: AWS.Request<any, any>
): Attributes {
  return {};
}

export function getS3ResponseSpanAttributes(
  response: AWS.Response<any, any>
): Attributes {
  return {};
}

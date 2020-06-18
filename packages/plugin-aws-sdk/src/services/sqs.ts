import { Attributes } from "@opentelemetry/api";
import { RequestMetadata } from "./service-attributes";

export function getSqsRequestSpanAttributes(
  request: AWS.Request<any, any>
): RequestMetadata {
  const operation = (request as any)?.operation;
  switch (operation) {
    case "receiveMessage":
      return {
        attributes: {},
        isIncoming: true,
      };
  }

  return {
    attributes: {},
    isIncoming: false,
  };
}

export function getSqsResponseSpanAttributes(
  response: AWS.Response<any, any>
): Attributes {
  return {};
}

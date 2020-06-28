import { Span, Attributes } from "@opentelemetry/api";

/*
isIncoming - if true, then the operation callback / promise should be bind with the operation's span 
*/
export interface RequestMetadata {
  isIncoming: boolean;
  spanAttributes?: Attributes;
}

export interface ServiceExtension {
  // called before request is sent, and before span is created
  requestHook: (request: AWS.Request<any, any>) => RequestMetadata;
  responseHook: (response: AWS.Response<any, any>, span: Span) => void;
}

import { Span } from "@opentelemetry/api";

/*
isIncoming - if true, then the operation callback / promise should be bind with the operation's span 
*/
export interface RequestMetadata {
  isIncoming: boolean;
}

export interface ServiceExtension {
  requestHook: (request: AWS.Request<any, any>, span: Span) => RequestMetadata;
  responseHook: (response: AWS.Response<any, any>, span: Span) => void;
}

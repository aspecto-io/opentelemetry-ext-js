import { Span, Attributes, SpanKind } from '@opentelemetry/api';

/*
isIncoming - if true, then the operation callback / promise should be bind with the operation's span 
*/
export interface RequestMetadata {
    isIncoming: boolean;
    spanAttributes?: Attributes;
    spanKind?: SpanKind;
    spanName?: string;
}

export interface ServiceExtension {
    // called before request is sent, and before span is started
    requestHook: (request: AWS.Request<any, any>) => RequestMetadata;

    // called before request is sent, and after span is started
    requestPostSpanHook?: (request: AWS.Request<any, any>) => void;

    responseHook: (response: AWS.Response<any, any>, span: Span) => void;
}

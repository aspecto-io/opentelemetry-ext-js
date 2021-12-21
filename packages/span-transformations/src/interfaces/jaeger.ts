export interface JaegerTag {
    key: string;
    value: string;
    type: string;
}

export interface JaegerReference {
    refType: string;
    traceID: string;
    spanID: string;
}

export interface JaegerSpan {
    traceID: string;
    spanID: string;
    flags: number;
    operationName: string;
    references: JaegerReference[];
    startTime: number;
    duration: number;
    tags: JaegerTag[];
    logs: [];
    processID: string;
    warnings: string[] | null;
}

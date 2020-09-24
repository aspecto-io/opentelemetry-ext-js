import { Span, CanonicalCode, Logger } from '@opentelemetry/api';

export function safeExecute<T extends (...args: unknown[]) => ReturnType<T>>(
    spans: Span[],
    execute: T,
    rethrow: boolean,
    logger: Logger
): ReturnType<T> | void {
    try {
        return execute();
    } catch (error) {
        if (rethrow) {
            spans.forEach((span) => {
                span.setStatus({
                    code: CanonicalCode.INTERNAL,
                    message: error?.message,
                });
                span.end();
            });
            throw error;
        }
        logger?.error('Caught Error ', error);
    }
}

import { trace, context } from '@opentelemetry/api';
import { TypeormInstrumentationConfig } from '../types';

export function shouldSkipInstrumentation(config: TypeormInstrumentationConfig) {
    return config.requireParentSpan === true && trace.getSpan(context.active()) === undefined;
}

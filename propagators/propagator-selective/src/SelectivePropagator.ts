import { Context, TextMapGetter, TextMapPropagator, TextMapSetter } from '@opentelemetry/api';
import { SelectivePropagatorConfig } from './types';

export class SelectivePropagator implements TextMapPropagator {
    constructor(private propagator: TextMapPropagator, private config: SelectivePropagatorConfig = {}) {}

    inject(context: Context, carrier: any, setter: TextMapSetter<any>): void {
        if (!this.config.injectEnabled) return;
        return this.propagator.inject(context, carrier, setter);
    }

    extract(context: Context, carrier: any, getter: TextMapGetter<any>): Context {
        if (!this.config.extractEnabled) return context;
        return this.propagator.extract(context, carrier, getter);
    }

    fields(): string[] {
        return this.propagator.fields();
    }
}

# `span-transformations`

## Usage
Utility functions to convert between different span types. 
Currently only supports converting spans from Jaeger(proto, like the one currently received from jaeger internal json api) to opentelemetry ReadableSpan.

```
import { convertJaegerSpanToOtelReadableSpan } from 'opentelemetry-span-transformations';
const otelSpan = convertJaegerSpanToOtelReadableSpan(jaegerSpan);
```

ReadableSpans fields that we do not support for now(not taking them from jaeger span):
```
SpanContext.isRemote
SpanContext.traceState
Links
Events
Status.message
```

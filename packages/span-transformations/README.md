# `span-transformations`

> TODO: description

## Usage
Utility functions to convert between different span types. 
Currently only supports converting spans from Jaeger(proto, like the one currently received from jaeger internal json api) to opentelemetry.

```
import { convertJaegerSpanToOtel } from 'opentelemetry-span-transformations';
const otelSpan = convertJaegerSpanToOtel(jaegerSpan);
```

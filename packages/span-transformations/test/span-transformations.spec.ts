'use strict';
import 'mocha';
import expect from 'expect';

const { convertJaegerSpanToOtelReadableSpan } = require('..');
const jaegerProtoSpan = require('./json/jaegerProtoSpan.json');
const jaegerSpanConvertedToOtel = require('./json/jaegerProtoConvertedToOTELReadableSpan.json');

describe('jaeger conversions', () => {
    it('needs to convert jaeger proto to OTEL format correctly', () => {
        const converted = convertJaegerSpanToOtelReadableSpan(jaegerProtoSpan);
        expect(converted.kind).toEqual(jaegerSpanConvertedToOtel.kind);
        expect(converted.spanContext()).toEqual({
            traceId: '096cb59a7500438fd7be37575fecb1fa',
            spanId: 'ca0ea597b91a47e5',
            traceFlags: 1,
        });
        expect(converted.parentSpanId).toEqual(jaegerSpanConvertedToOtel.parentSpanId);
        expect(converted.attributes).toEqual(jaegerSpanConvertedToOtel.attributes);
        expect(converted.instrumentationLibrary).toEqual(jaegerSpanConvertedToOtel.instrumentationLibrary);
        expect(converted.name).toEqual(jaegerSpanConvertedToOtel.name);
        expect(converted.links).toEqual(jaegerSpanConvertedToOtel.links);
        expect(converted.ended).toEqual(jaegerSpanConvertedToOtel.ended);
        expect(converted.events).toEqual(jaegerSpanConvertedToOtel.events);
        expect(converted.status).toEqual(jaegerSpanConvertedToOtel.status);
        expect(converted.resource.attributes).toEqual(jaegerSpanConvertedToOtel.resource.attributes);
    });
});

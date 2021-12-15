'use strict';
import 'mocha';
import expect from 'expect';
import { convertJaegerSpanToOtel } from '..';

const jaegerProtoSpan = require('./json/jaegerProtoSpan.json');
const jaegerSpanConvertedToOtel = require('./json/jaegerProtoConvertedToOTEL.json');

describe('jaeger conversions', () => {
    it('needs to convert jaeger proto to OTEL format correctly', () => {
        const converted = convertJaegerSpanToOtel(jaegerProtoSpan);
        expect(converted.kind).toEqual(jaegerSpanConvertedToOtel.kind);
        expect(converted.attributes).toEqual(jaegerSpanConvertedToOtel.attributes);
        expect(converted.instrumentationLibrary).toEqual(jaegerSpanConvertedToOtel.instrumentationLibrary);
        expect(converted.name).toEqual(jaegerSpanConvertedToOtel.name);
        expect(converted.links).toEqual(jaegerSpanConvertedToOtel.links);
        expect(converted.ended).toEqual(jaegerSpanConvertedToOtel.ended);
        expect(converted.events).toEqual(jaegerSpanConvertedToOtel.events);
        expect(converted.status).toEqual(jaegerSpanConvertedToOtel.status);
        expect(converted.resource).toEqual(jaegerSpanConvertedToOtel.resource);
    });
});

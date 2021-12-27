import 'mocha';
import expect from 'expect';
import * as sinon from 'sinon';
import {
    TextMapPropagator,
    ROOT_CONTEXT,
    Context,
    defaultTextMapGetter,
    defaultTextMapSetter,
    createContextKey,
} from '@opentelemetry/api';

import * as ps from '../src';
import { SinonMock } from 'sinon';

export class NoopTextMapPropagator implements TextMapPropagator {
    /** Noop inject function does nothing */
    inject(_context: Context, _carrier: unknown): void {}
    /** Noop extract function does nothing and returns the input context */
    extract(context: Context, _carrier: unknown): Context {
        return context;
    }
    fields(): string[] {
        return [];
    }
}

describe('SelectivePropagator', () => {
    let noopPropagator: TextMapPropagator;
    let mock: SinonMock;

    before(() => {
        noopPropagator = new NoopTextMapPropagator();
        mock = sinon.mock(noopPropagator);
    });

    after(() => {
        mock.verify();
    });

    describe('inject', () => {
        it('should inject when enabled', () => {
            mock.expects('inject').once();
            const selectivePropagator = new ps.SelectivePropagator(noopPropagator, {
                injectEnabled: true,
            });
            selectivePropagator.inject(ROOT_CONTEXT, {}, defaultTextMapSetter);
        });

        it('should not inject when disabled', () => {
            mock.expects('inject').never();
            const selectivePropagator = new ps.SelectivePropagator(noopPropagator, {
                injectEnabled: false,
            });
            selectivePropagator.inject(ROOT_CONTEXT, {}, defaultTextMapSetter);
        });

        it('should not inject when not set', () => {
            mock.expects('inject').never();
            const selectivePropagator = new ps.SelectivePropagator(noopPropagator, {});
            selectivePropagator.inject(ROOT_CONTEXT, {}, defaultTextMapSetter);
        });
    });

    describe('extract', () => {
        it('should extract when enabled', () => {
            const extractedContext = ROOT_CONTEXT.setValue(createContextKey('k'), 'v');
            mock.expects('extract').once().returns(extractedContext);
            const SelectivePropagator = new ps.SelectivePropagator(noopPropagator, {
                extractEnabled: true,
            });
            const returnedContext = SelectivePropagator.extract(ROOT_CONTEXT, {}, defaultTextMapGetter);
            expect(returnedContext).toBe(extractedContext);
        });

        it('should not extract when disabled', () => {
            mock.expects('extract').never();
            const SelectivePropagator = new ps.SelectivePropagator(noopPropagator, {
                extractEnabled: false,
            });
            const origContext = ROOT_CONTEXT;
            const returnedContext = SelectivePropagator.extract(ROOT_CONTEXT, {}, defaultTextMapGetter);
            expect(returnedContext).toBe(origContext);
        });

        it('should not extract when not set', () => {
            mock.expects('extract').never();
            const SelectivePropagator = new ps.SelectivePropagator(noopPropagator, {});
            const origContext = ROOT_CONTEXT;
            const returnedContext = SelectivePropagator.extract(ROOT_CONTEXT, {}, defaultTextMapGetter);
            expect(returnedContext).toBe(origContext);
        });
    });

    describe('fields', () => {
        it('should return field of original propagator', () => {
            const origFields = ['foo', 'bar'];
            mock.expects('fields').once().returns(origFields);
            const selectivePropagator = new ps.SelectivePropagator(noopPropagator);
            const returnedFields = selectivePropagator.fields();
            expect(returnedFields).toBe(origFields);
        });
    });
});

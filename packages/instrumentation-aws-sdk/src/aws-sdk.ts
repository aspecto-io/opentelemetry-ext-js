/*
    For the request to be sent, one of the two conditions has to be true:
        a callback was passed to the request
        a promise was retrieved from the request

    Number of times "onComplete" event is fired:
                |   w/o promise()   |   w/ promise()
    no callback |       0           |       1    
    callback    |       1           |       2   
 */
import { Span, SpanAttributes, SpanKind, context, setSpan, suppressInstrumentation, Context, diag } from '@opentelemetry/api';
import AWS from 'aws-sdk';
import { AttributeNames } from './enums';
import { ServicesExtensions } from './services';
import { AwsSdkInstrumentationConfig } from './types';
import { VERSION } from './version';
import {
    InstrumentationBase,
    InstrumentationModuleDefinition,
    InstrumentationNodeModuleDefinition,
    isWrapped,
    safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';

export class AwsInstrumentation extends InstrumentationBase<typeof AWS> {
    static readonly component = 'aws-sdk';
    protected _config!: AwsSdkInstrumentationConfig;
    private REQUEST_SPAN_KEY = Symbol('opentelemetry.instrumentation.aws-sdk.span');
    private servicesExtensions: ServicesExtensions;
    private moduleVersion: string;

    constructor(config: AwsSdkInstrumentationConfig = {}) {
        super('opentelemetry-instrumentation-aws-sdk', VERSION, Object.assign({}, config));
    }

    setConfig(config: AwsSdkInstrumentationConfig = {}) {
        this._config = Object.assign({}, config);
    }

    protected init(): InstrumentationModuleDefinition<typeof AWS> {
        const module = new InstrumentationNodeModuleDefinition<typeof AWS>(
            AwsInstrumentation.component,
            ['*'],
            this.patch.bind(this),
            this.unpatch.bind(this)
        );
        return module;
    }

    protected patch(moduleExports: typeof AWS, moduleVersion: string) {
        this.moduleVersion = moduleVersion;
        this.servicesExtensions = new ServicesExtensions(this.tracer, this._config);

        diag.debug(`applying patch to ${AwsInstrumentation.component}`);
        this.unpatch(moduleExports);
        this._wrap(moduleExports?.Request.prototype, 'send', this._getRequestSendPatch.bind(this));
        this._wrap(moduleExports?.Request.prototype, 'promise', this._getRequestPromisePatch.bind(this));

        return moduleExports;
    }

    protected unpatch(moduleExports: typeof AWS) {
        if (isWrapped(moduleExports?.Request.prototype.send)) {
            this._unwrap(moduleExports.Request.prototype, 'send');
        }
        if (isWrapped(moduleExports?.Request.prototype.promise)) {
            this._unwrap(moduleExports.Request.prototype, 'promise');
        }
    }

    private _bindPromise(target: Promise<any>, contextForCallbacks: Context) {
        const origThen = target.then;
        target.then = function (onFulfilled, onRejected) {
            const newOnFulfilled = context.bind(onFulfilled, contextForCallbacks);
            const newOnRejected = context.bind(onRejected, contextForCallbacks);
            return origThen.call(this, newOnFulfilled, newOnRejected);
        };
        return target;
    }

    private _startAwsSpan(
        request: AWS.Request<any, any>,
        additionalSpanAttributes?: SpanAttributes,
        spanKind?: SpanKind,
        spanName?: string
    ): Span {
        const operation = (request as any).operation;
        const service = (request as any).service;
        const name = spanName ?? this._getSpanName(request);

        const newSpan = this.tracer.startSpan(name, {
            kind: spanKind,
            attributes: {
                [AttributeNames.COMPONENT]: AwsInstrumentation.component,
                [AttributeNames.AWS_OPERATION]: operation,
                [AttributeNames.AWS_SIGNATURE_VERSION]: service?.config?.signatureVersion,
                [AttributeNames.AWS_REGION]: service?.config?.region,
                [AttributeNames.AWS_SERVICE_API]: service?.api?.className,
                [AttributeNames.AWS_SERVICE_IDENTIFIER]: service?.serviceIdentifier,
                [AttributeNames.AWS_SERVICE_NAME]: service?.api?.abbreviation,
                ...additionalSpanAttributes,
            },
        });

        if (this._config.moduleVersionAttributeName) {
            newSpan.setAttribute(this._config.moduleVersionAttributeName, this.moduleVersion);
        }

        request[this.REQUEST_SPAN_KEY] = newSpan;
        return newSpan;
    }

    private _callUserPreRequestHook(span: Span, request: AWS.Request<any, any>) {
        if (this._config?.preRequestHook) {
            safeExecuteInTheMiddle(
                () => this._config.preRequestHook(span, request),
                (e: Error) => {
                    if (e)
                        diag.error(`${AwsInstrumentation.component} instrumentation: preRequestHook error`, e);
                },
                true
            );
        }
    }

    private _callUserResponseHook(span: Span, response: AWS.Response<any, any>) {
        if (this._config?.responseHook) {
            safeExecuteInTheMiddle(
                () => this._config.responseHook(span, response),
                (e: Error) => {
                    if (e) diag.error(`${AwsInstrumentation.component} instrumentation: responseHook error`, e);
                },
                true
            );
        }
    }

    private _registerCompletedEvent(span: Span, request: AWS.Request<any, any>, completedEventContext: Context) {
        const self = this;
        request.on('complete', (response) => {
            // read issue https://github.com/aspecto-io/opentelemetry-ext-js/issues/60
            context.with(completedEventContext, () => {
                if (!request[self.REQUEST_SPAN_KEY]) {
                    return;
                }
                request[self.REQUEST_SPAN_KEY] = undefined;

                if (response.error) {
                    span.setAttribute(AttributeNames.AWS_ERROR, response.error);
                }

                this._callUserResponseHook(span, response);
                this.servicesExtensions.responseHook(response, span);

                span.setAttribute(AttributeNames.AWS_REQUEST_ID, response.requestId);
                span.end();
            });
        });
    }

    private _getRequestSendPatch(original: (callback?: (err: any, data: any) => void) => void) {
        const self = this;
        return function (callback?: (err: any, data: any) => void) {
            const awsRequest: AWS.Request<any, any> = this;
            /* 
        if the span was already started, we don't want to start a new one 
        when Request.promise() is called
      */
            if (this._asm.currentState === 'complete' || awsRequest[self.REQUEST_SPAN_KEY]) {
                return original.apply(this, arguments);
            }

            const requestMetadata = self.servicesExtensions.requestHook(awsRequest);
            const span = self._startAwsSpan(
                awsRequest,
                requestMetadata.spanAttributes,
                requestMetadata.spanKind,
                requestMetadata.spanName
            );
            const activeContextWithSpan = setSpan(context.active(), span);
            const callbackWithContext = context.bind(callback, activeContextWithSpan);

            self._callUserPreRequestHook(span, awsRequest);
            self._registerCompletedEvent(span, awsRequest, activeContextWithSpan);

            return context.with(activeContextWithSpan, () => {
                self.servicesExtensions.requestPostSpanHook(awsRequest);
                return self._callOriginalFunction(() => original.call(awsRequest, callbackWithContext));
            });
        };
    }

    private _getRequestPromisePatch(original: () => Promise<any>) {
        const self = this;
        return function (): Promise<any> {
            const awsRequest: AWS.Request<any, any> = this;
            // if the span was already started, we don't want to start a new one when Request.promise() is called
            if (this._asm.currentState === 'complete' || awsRequest[self.REQUEST_SPAN_KEY]) {
                return original.apply(this, arguments);
            }

            const requestMetadata = self.servicesExtensions.requestHook(awsRequest);
            const span = self._startAwsSpan(
                awsRequest,
                requestMetadata.spanAttributes,
                requestMetadata.spanKind,
                requestMetadata.spanName
            );

            const activeContextWithSpan = setSpan(context.active(), span);
            self._callUserPreRequestHook(span, awsRequest);
            self._registerCompletedEvent(span, awsRequest, activeContextWithSpan);

            const origPromise: Promise<any> = context.with(activeContextWithSpan, () => {
                self.servicesExtensions.requestPostSpanHook(awsRequest);
                return self._callOriginalFunction(() => original.call(awsRequest, arguments));
            });

            return requestMetadata.isIncoming
                ? self._bindPromise(origPromise, activeContextWithSpan)
                : origPromise;
        };
    }

    private _getSpanName = (request: any) => {
        return `aws.${request.service?.serviceIdentifier ?? 'request'}.${request.operation}`;
    };

    private _callOriginalFunction<T>(originalFunction: (...args: any[]) => T): T {
        if (this._config?.suppressInternalInstrumentation) {
            return context.with(suppressInstrumentation(context.active()), originalFunction);
        } else {
            return originalFunction();
        }
    }
}

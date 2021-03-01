/*
    For the request to be sent, one of the two conditions has to be true:
        a callback was passed to the request
        a promise was retrieved from the request

    Number of times "onComplete" event is fired:
                |   w/o promise()   |   w/ promise()
    no callback |       0           |       1    
    callback    |       1           |       2   
 */
import {
    Span,
    SpanKind,
    context,
    setSpan,
    suppressInstrumentation,
    Context,
    diag,
    SpanStatusCode,
} from '@opentelemetry/api';
import AWS from 'aws-sdk';
import { AttributeNames } from './enums';
import { ServicesExtensions } from './services';
import { AwsSdkInstrumentationConfig, NormalizedRequest, NormalizedResponse } from './types';
import { VERSION } from './version';
import {
    InstrumentationBase,
    InstrumentationConfig,
    InstrumentationModuleDefinition,
    InstrumentationNodeModuleDefinition,
    isWrapped,
    safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import type {
    MiddlewareStack,
    HandlerExecutionContext,
    Command as AwsV3Command,
    Handler as AwsV3MiddlewareHandler,
} from '@aws-sdk/types';
import { extractAttributesFromNormalizedRequest, normalizeV2Request, normalizeV3Request, removeSuffixFromStringIfExists } from './utils';
import { RequestMetadata } from './services/ServiceExtension';

type Config = InstrumentationConfig & AwsSdkInstrumentationConfig;

const storedV3ClientConfig = Symbol('otel.aws-sdk.client.config');
export class AwsInstrumentation extends InstrumentationBase<typeof AWS> {
    static readonly component = 'aws-sdk';
    protected _config!: Config;
    private REQUEST_SPAN_KEY = Symbol('opentelemetry.instrumentation.aws-sdk.span');
    private servicesExtensions: ServicesExtensions;

    constructor(config: Config = {}) {
        super('opentelemetry-instrumentation-aws-sdk', VERSION, Object.assign({}, config));
    }

    setConfig(config: Config = {}) {
        this._config = Object.assign({}, config);
    }

    protected init(): InstrumentationModuleDefinition<typeof AWS>[] {
        const v3MiddlewareStack = new InstrumentationNodeModuleDefinition<typeof AWS>(
            '@aws-sdk/middleware-stack',
            ['*'],
            this.patchV3ConstructStack.bind(this),
            this.unpatchV3ConstructStack.bind(this)
        );

        const v3SmithyClient = new InstrumentationNodeModuleDefinition<typeof AWS>(
            '@aws-sdk/smithy-client',
            ['*'],
            this.patchV3SmithyClient.bind(this),
            this.unpatchV3SmithyClient.bind(this)
        );

        const v2Module = new InstrumentationNodeModuleDefinition<typeof AWS>(
            AwsInstrumentation.component,
            ['*'],
            this.patchV2.bind(this),
            this.unpatchV2.bind(this)
        );
        return [v2Module, v3MiddlewareStack, v3SmithyClient];
    }

    protected patchV3ConstructStack(moduleExports) {
        diag.debug(`applying patch to aws-sdk v3 constructStack`);
        this._wrap(moduleExports, 'constructStack', this._getV3ConstructStackPatch.bind(this));
        return moduleExports;
    }

    protected unpatchV3ConstructStack(moduleExports) {
        diag.debug(`applying unpatch to aws-sdk v3 constructStack`);
        this._unwrap(moduleExports, 'constructStack');
        return moduleExports;
    }

    protected patchV3SmithyClient(moduleExports) {
        diag.debug(`applying patch to aws-sdk v3 client send`);
        this._wrap(moduleExports.Client.prototype, 'send', this._getV3SmithyClientSendPatch.bind(this));
        return moduleExports;
    }

    protected unpatchV3SmithyClient(moduleExports) {
        diag.debug(`applying patch to aws-sdk v3 constructStack`);
        this._unwrap(moduleExports.Client.prototype, 'send');
        return moduleExports;
    }

    protected patchV2(moduleExports: typeof AWS) {
        this.servicesExtensions = new ServicesExtensions(this.tracer, this._config);

        diag.debug(`applying patch to ${AwsInstrumentation.component}`);
        this.unpatchV2(moduleExports);
        this._wrap(moduleExports?.Request.prototype, 'send', this._getRequestSendPatch.bind(this));
        this._wrap(moduleExports?.Request.prototype, 'promise', this._getRequestPromisePatch.bind(this));

        return moduleExports;
    }

    protected unpatchV2(moduleExports: typeof AWS) {
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

    private _startAwsV3Span(normalizedRequest: NormalizedRequest, metadata: RequestMetadata): Span {
        const name = metadata.spanName ?? `${normalizedRequest.serviceName}.${normalizedRequest.commandName}`;
        const newSpan = this.tracer.startSpan(name, {
            kind: metadata.spanKind,
            attributes: {
                ...extractAttributesFromNormalizedRequest(normalizedRequest),
                ...metadata.spanAttributes,
            },
        });

        return newSpan;
    }

    private _startAwsV2Span(
        request: AWS.Request<any, any>,
        metadata: RequestMetadata,
        normalizedRequest: NormalizedRequest
    ): Span {
        const operation = (request as any).operation;
        const service = (request as any).service;
        const serviceIdentifier = service?.serviceIdentifier;
        const name = metadata.spanName ?? this._getSpanName(serviceIdentifier, operation);

        const newSpan = this.tracer.startSpan(name, {
            kind: metadata.spanKind ?? SpanKind.CLIENT,
            attributes: {
                [AttributeNames.COMPONENT]: AwsInstrumentation.component,
                [AttributeNames.AWS_OPERATION]: operation,
                [AttributeNames.AWS_SIGNATURE_VERSION]: service?.config?.signatureVersion,
                [AttributeNames.AWS_SERVICE_API]: service?.api?.className,
                [AttributeNames.AWS_SERVICE_IDENTIFIER]: serviceIdentifier,
                [AttributeNames.AWS_SERVICE_NAME]: service?.api?.abbreviation,
                ...extractAttributesFromNormalizedRequest(normalizedRequest),
                ...metadata.spanAttributes,
            },
        });

        return newSpan;
    }

    private _callUserPreRequestHook(span: Span, request: NormalizedRequest) {
        if (this._config?.preRequestHook) {
            safeExecuteInTheMiddle(
                () => this._config.preRequestHook(span, request),
                (e: Error) => {
                    if (e) diag.error(`${AwsInstrumentation.component} instrumentation: preRequestHook error`, e);
                },
                true
            );
        }
    }

    private _callUserResponseHook(span: Span, response: NormalizedResponse) {
        const responseHook = this._config?.responseHook;
        if (!responseHook) return;

        safeExecuteInTheMiddle(
            () => responseHook(span, response),
            (e: Error) => {
                if (e) diag.error(`${AwsInstrumentation.component} instrumentation: responseHook error`, e);
            },
            true
        );
    }

    private _registerV2CompletedEvent(
        span: Span,
        v2Request: AWS.Request<any, any>,
        normalizedRequest: NormalizedRequest,
        completedEventContext: Context
    ) {
        const self = this;
        v2Request.on('complete', (response) => {
            // read issue https://github.com/aspecto-io/opentelemetry-ext-js/issues/60
            context.with(completedEventContext, () => {
                if (!v2Request[self.REQUEST_SPAN_KEY]) {
                    return;
                }
                v2Request[self.REQUEST_SPAN_KEY] = undefined;

                const normalizedResponse: NormalizedResponse = {
                    data: response.data,
                    request: normalizedRequest,
                };

                self._callUserResponseHook(span, normalizedResponse);
                if (response.error) {
                    span.setAttribute(AttributeNames.AWS_ERROR, response.error);
                } else {
                    this.servicesExtensions.responseHook(normalizedResponse, span);
                }

                span.setAttribute(AttributeNames.AWS_REQUEST_ID, response.requestId);
                span.end();
            });
        });
    }

    private _getV3ConstructStackPatch(original: (...args: unknown[]) => MiddlewareStack<any, any>) {
        const self = this;
        return function constructStack(...args: unknown[]): MiddlewareStack<any, any> {
            const stack: MiddlewareStack<any, any> = original.apply(this, args);
            self.patchV3MiddlewareStack(stack);
            return stack;
        };
    }

    private _getV3SmithyClientSendPatch(original: (...args: unknown[]) => Promise<any>) {
        const self = this;
        return function send(command: AwsV3Command<any, any, any, any, any>): Promise<any> {
            command[storedV3ClientConfig] = this.config;
            return original.apply(this, arguments);
        }
    }

    private patchV3MiddlewareStack(middlewareStackToPatch: MiddlewareStack<any, any>) {
        this._wrap(middlewareStackToPatch, 'resolve', this._getV3MiddlewareStackResolvePatch.bind(this));

        // 'clone' and 'concat' functions are internally calling 'constructStack' which is in same
        // module, thus not patched, and we need to take care of it specifically.
        this._wrap(middlewareStackToPatch, 'clone', this._getV3MiddlewareStackClonePatch.bind(this));
        this._wrap(middlewareStackToPatch, 'concat', this._getV3MiddlewareStackClonePatch.bind(this));
    }

    private _getV3MiddlewareStackClonePatch(original: (...args: unknown[]) => MiddlewareStack<any, any>) {
        const self = this;
        return function (...args: unknown[]) {
            const newStack = original.apply(this, arguments);
            self.patchV3MiddlewareStack(newStack);
            return newStack;
        };
    }

    private _getV3MiddlewareStackResolvePatch(
        original: (_handler: unknown, context: HandlerExecutionContext) => AwsV3MiddlewareHandler<any, any>
    ) {
        const self = this;
        return function (
            _handler: unknown,
            awsExecutionContext: HandlerExecutionContext
        ): AwsV3MiddlewareHandler<any, any> {
            const origHandler = original.apply(this, arguments);
            const patchedHandler = async function (command: AwsV3Command<any, any, any, any, any>): Promise<any> {
                const clientConfig = command[storedV3ClientConfig];
                const regionPromise = clientConfig?.region?.();
                const region = regionPromise ? await regionPromise : undefined;
                const serviceName = clientConfig.serviceId ?? removeSuffixFromStringIfExists(awsExecutionContext.clientName, 'Client');
                const commandName = awsExecutionContext.commandName ?? command.constructor.name;
                const normalizedRequest = normalizeV3Request(
                    serviceName,
                    commandName,
                    command.input,
                    region,
                );
                const requestMetadata = self.servicesExtensions.requestPreSpanHook(normalizedRequest);
                const span = self._startAwsV3Span(normalizedRequest, requestMetadata);

                self._callUserPreRequestHook(span, normalizedRequest);
                const activeContextWithSpan = setSpan(context.active(), span);
                const resultPromise = context.with(activeContextWithSpan, () => {
                    self.servicesExtensions.requestPostSpanHook(normalizedRequest);
                    return self._callOriginalFunction(() => origHandler.apply(this, arguments));
                });
                resultPromise
                    .then((response) => {
                        const requestId = response.output?.$metadata?.requestId;
                        if (requestId) {
                            span.setAttribute(AttributeNames.AWS_REQUEST_ID, requestId);
                        }
                        const extendedRequestId = response.output?.$metadata?.extendedRequestId;
                        if (extendedRequestId) {
                            span.setAttribute(AttributeNames.AWS_REQUEST_EXTENDED_ID, extendedRequestId);
                        }

                        const normalizedResponse: NormalizedResponse = {
                            data: response.output,
                            request: normalizedRequest,
                        };
                        self.servicesExtensions.responseHook(normalizedResponse, span);
                        self._callUserResponseHook(span, normalizedResponse);
                        return response;
                    })
                    .catch((err) => {
                        span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
                        span.recordException(err);
                        throw err;
                    })
                    .finally(() => span.end());
                return requestMetadata.isIncoming
                    ? self._bindPromise(resultPromise, activeContextWithSpan)
                    : resultPromise;
            };
            return patchedHandler;
        };
    }

    private _getRequestSendPatch(original: (callback?: (err: any, data: any) => void) => void) {
        const self = this;
        return function (callback?: (err: any, data: any) => void) {
            const awsV2Request: AWS.Request<any, any> = this;
            /* 
        if the span was already started, we don't want to start a new one 
        when Request.promise() is called
      */
            if (this._asm.currentState === 'complete' || awsV2Request[self.REQUEST_SPAN_KEY]) {
                return original.apply(this, arguments);
            }

            const normalizedRequest = normalizeV2Request(awsV2Request);
            const requestMetadata = self.servicesExtensions.requestPreSpanHook(normalizedRequest);
            const span = self._startAwsV2Span(awsV2Request, requestMetadata, normalizedRequest);
            awsV2Request[self.REQUEST_SPAN_KEY] = span;
            const activeContextWithSpan = setSpan(context.active(), span);
            const callbackWithContext = context.bind(callback, activeContextWithSpan);

            self._callUserPreRequestHook(span, normalizedRequest);
            self._registerV2CompletedEvent(span, awsV2Request, normalizedRequest, activeContextWithSpan);

            return context.with(activeContextWithSpan, () => {
                self.servicesExtensions.requestPostSpanHook(normalizedRequest);
                return self._callOriginalFunction(() => original.call(awsV2Request, callbackWithContext));
            });
        };
    }

    private _getRequestPromisePatch(original: () => Promise<any>) {
        const self = this;
        return function (): Promise<any> {
            const awsV2Request: AWS.Request<any, any> = this;
            // if the span was already started, we don't want to start a new one when Request.promise() is called
            if (this._asm.currentState === 'complete' || awsV2Request[self.REQUEST_SPAN_KEY]) {
                return original.apply(this, arguments);
            }

            const normalizedRequest = normalizeV2Request(awsV2Request);
            const requestMetadata = self.servicesExtensions.requestPreSpanHook(normalizedRequest);
            const span = self._startAwsV2Span(awsV2Request, requestMetadata, normalizedRequest);
            awsV2Request[self.REQUEST_SPAN_KEY] = span;

            const activeContextWithSpan = setSpan(context.active(), span);
            self._callUserPreRequestHook(span, normalizedRequest);
            self._registerV2CompletedEvent(span, awsV2Request, normalizedRequest, activeContextWithSpan);

            const origPromise: Promise<any> = context.with(activeContextWithSpan, () => {
                self.servicesExtensions.requestPostSpanHook(normalizedRequest);
                return self._callOriginalFunction(() => original.call(awsV2Request, arguments));
            });

            return requestMetadata.isIncoming ? self._bindPromise(origPromise, activeContextWithSpan) : origPromise;
        };
    }

    private _getSpanName = (serviceIdentifier: string, operation: string) => {
        return `aws.${serviceIdentifier ?? 'request'}.${operation}`;
    };

    private _callOriginalFunction<T>(originalFunction: (...args: any[]) => T): T {
        if (this._config?.suppressInternalInstrumentation) {
            return context.with(suppressInstrumentation(context.active()), originalFunction);
        } else {
            return originalFunction();
        }
    }
}

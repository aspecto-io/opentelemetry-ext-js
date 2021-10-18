/*
    For the request to be sent, one of the two conditions has to be true:
        a callback was passed to the request
        a promise was retrieved from the request

    Number of times "onComplete" event is fired:
                |   w/o promise()   |   w/ promise()
    no callback |       0           |       1    
    callback    |       1           |       2   
 */
import { Span, SpanKind, context, trace, Context, diag, SpanStatusCode } from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import type AWS from 'aws-sdk';
import { AttributeNames } from './enums';
import { ServicesExtensions } from './services';
import { AwsSdkInstrumentationConfig, NormalizedRequest, NormalizedResponse } from './types';
import { VERSION } from './version';
import {
    InstrumentationBase,
    InstrumentationModuleDefinition,
    InstrumentationNodeModuleDefinition,
    InstrumentationNodeModuleFile,
    isWrapped,
    safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import type {
    MiddlewareStack,
    HandlerExecutionContext,
    Command as AwsV3Command,
    Handler as AwsV3MiddlewareHandler,
} from '@aws-sdk/types';
import {
    bindPromise,
    extractAttributesFromNormalizedRequest,
    normalizeV2Request,
    normalizeV3Request,
    removeSuffixFromStringIfExists,
} from './utils';
import { RequestMetadata } from './services/ServiceExtension';

const storedV3ClientConfig = Symbol('opentelemetry.aws-sdk.client.config');

export class AwsInstrumentation extends InstrumentationBase<typeof AWS> {
    static readonly component = 'aws-sdk';
    protected override _config!: AwsSdkInstrumentationConfig;
    private REQUEST_SPAN_KEY = Symbol('opentelemetry.instrumentation.aws-sdk.span');
    private servicesExtensions: ServicesExtensions = new ServicesExtensions();

    constructor(config: AwsSdkInstrumentationConfig = {}) {
        super('opentelemetry-instrumentation-aws-sdk', VERSION, Object.assign({}, config));
    }

    override setConfig(config: AwsSdkInstrumentationConfig = {}) {
        this._config = Object.assign({}, config);
    }

    protected init(): InstrumentationModuleDefinition<typeof AWS>[] {
        const v3MiddlewareStackFileOldVersions = new InstrumentationNodeModuleFile(
            `@aws-sdk/middleware-stack/dist/cjs/MiddlewareStack.js`,
            ['>=3.1.0 <3.36.0'],
            this.patchV3ConstructStack.bind(this),
            this.unpatchV3ConstructStack.bind(this)
        );
        const v3MiddlewareStackFileNewVersions = new InstrumentationNodeModuleFile(
            `@aws-sdk/middleware-stack/dist-cjs/MiddlewareStack.js`,
            ['>=3.36.0'],
            this.patchV3ConstructStack.bind(this),
            this.unpatchV3ConstructStack.bind(this)
        );

        // as for aws-sdk v3.13.1, constructStack is exported from @aws-sdk/middleware-stack as
        // getter instead of function, which fails shimmer.
        // so we are patching the MiddlewareStack.js file directly to get around it.
        const v3MiddlewareStack = new InstrumentationNodeModuleDefinition<typeof AWS>(
            '@aws-sdk/middleware-stack',
            ['^3.1.0'],
            undefined,
            undefined,
            [v3MiddlewareStackFileOldVersions, v3MiddlewareStackFileNewVersions]
        );

        const v3SmithyClient = new InstrumentationNodeModuleDefinition<typeof AWS>(
            '@aws-sdk/smithy-client',
            ['^3.1.0'],
            this.patchV3SmithyClient.bind(this),
            this.unpatchV3SmithyClient.bind(this)
        );

        const v2Request = new InstrumentationNodeModuleFile<typeof AWS.Request>(
            'aws-sdk/lib/core.js',
            ['^2.17.0'],
            this.patchV2.bind(this),
            this.unpatchV2.bind(this)
        );

        const v2Module = new InstrumentationNodeModuleDefinition<typeof AWS>(
            'aws-sdk',
            ['^2.17.0'],
            undefined,
            undefined,
            [v2Request]
        );

        return [v2Module, v3MiddlewareStack, v3SmithyClient];
    }

    protected patchV3ConstructStack(moduleExports, moduleVersion: string) {
        diag.debug(`aws-sdk instrumentation: applying patch to aws-sdk v3 constructStack`);
        this._wrap(moduleExports, 'constructStack', this._getV3ConstructStackPatch.bind(this, moduleVersion));
        return moduleExports;
    }

    protected unpatchV3ConstructStack(moduleExports) {
        diag.debug(`aws-sdk instrumentation: applying unpatch to aws-sdk v3 constructStack`);
        this._unwrap(moduleExports, 'constructStack');
        return moduleExports;
    }

    protected patchV3SmithyClient(moduleExports) {
        diag.debug(`aws-sdk instrumentation: applying patch to aws-sdk v3 client send`);
        this._wrap(moduleExports.Client.prototype, 'send', this._getV3SmithyClientSendPatch.bind(this));
        return moduleExports;
    }

    protected unpatchV3SmithyClient(moduleExports) {
        diag.debug(`aws-sdk instrumentation: applying patch to aws-sdk v3 constructStack`);
        this._unwrap(moduleExports.Client.prototype, 'send');
        return moduleExports;
    }

    protected patchV2(moduleExports: typeof AWS, moduleVersion: string) {
        diag.debug(`aws-sdk instrumentation: applying patch to ${AwsInstrumentation.component}`);
        this.unpatchV2(moduleExports);
        this._wrap(moduleExports?.Request.prototype, 'send', this._getRequestSendPatch.bind(this, moduleVersion));
        this._wrap(moduleExports?.Request.prototype, 'promise', this._getRequestPromisePatch.bind(this, moduleVersion));

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

    private _startAwsV3Span(
        normalizedRequest: NormalizedRequest,
        metadata: RequestMetadata,
        moduleVersion: string
    ): Span {
        const name = metadata.spanName ?? `${normalizedRequest.serviceName}.${normalizedRequest.commandName}`;
        const newSpan = this.tracer.startSpan(name, {
            kind: metadata.spanKind,
            attributes: {
                ...extractAttributesFromNormalizedRequest(normalizedRequest),
                ...metadata.spanAttributes,
            },
        });

        if (this._config.moduleVersionAttributeName) {
            newSpan.setAttribute(this._config.moduleVersionAttributeName, moduleVersion);
        }

        return newSpan;
    }

    private _startAwsV2Span(
        request: AWS.Request<any, any>,
        metadata: RequestMetadata,
        normalizedRequest: NormalizedRequest,
        moduleVersion: string
    ): Span {
        const operation = (request as any).operation;
        const service = (request as any).service;
        const serviceIdentifier = service?.serviceIdentifier;
        const name = metadata.spanName ?? `${normalizedRequest.serviceName}.${normalizedRequest.commandName}`;

        const newSpan = this.tracer.startSpan(name, {
            kind: metadata.spanKind ?? SpanKind.CLIENT,
            attributes: {
                [AttributeNames.AWS_OPERATION]: operation,
                [AttributeNames.AWS_SIGNATURE_VERSION]: service?.config?.signatureVersion,
                [AttributeNames.AWS_SERVICE_API]: service?.api?.className,
                [AttributeNames.AWS_SERVICE_IDENTIFIER]: serviceIdentifier,
                [AttributeNames.AWS_SERVICE_NAME]: service?.api?.abbreviation,
                ...extractAttributesFromNormalizedRequest(normalizedRequest),
                ...metadata.spanAttributes,
            },
        });

        if (this._config.moduleVersionAttributeName) {
            newSpan.setAttribute(this._config.moduleVersionAttributeName, moduleVersion);
        }

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
                delete v2Request[self.REQUEST_SPAN_KEY];

                const normalizedResponse: NormalizedResponse = {
                    data: response.data,
                    request: normalizedRequest,
                };

                self._callUserResponseHook(span, normalizedResponse);
                if (response.error) {
                    span.setAttribute(AttributeNames.AWS_ERROR, response.error);
                } else {
                    this.servicesExtensions.responseHook(normalizedResponse, span, self.tracer, self._config);
                }

                span.setAttribute(AttributeNames.AWS_REQUEST_ID, response.requestId);
                span.end();
            });
        });
    }

    private _getV3ConstructStackPatch(
        moduleVersion: string,
        original: (...args: unknown[]) => MiddlewareStack<any, any>
    ) {
        const self = this;
        return function constructStack(...args: unknown[]): MiddlewareStack<any, any> {
            const stack: MiddlewareStack<any, any> = original.apply(this, args);
            self.patchV3MiddlewareStack(moduleVersion, stack);
            return stack;
        };
    }

    private _getV3SmithyClientSendPatch(original: (...args: unknown[]) => Promise<any>) {
        const self = this;
        return function send(command: AwsV3Command<any, any, any, any, any>): Promise<any> {
            command[storedV3ClientConfig] = this.config;
            return original.apply(this, arguments);
        };
    }

    private patchV3MiddlewareStack(moduleVersion: string, middlewareStackToPatch: MiddlewareStack<any, any>) {
        if (!isWrapped(middlewareStackToPatch.resolve)) {
            this._wrap(
                middlewareStackToPatch,
                'resolve',
                this._getV3MiddlewareStackResolvePatch.bind(this, moduleVersion)
            );
        }

        // 'clone' and 'concat' functions are internally calling 'constructStack' which is in same
        // module, thus not patched, and we need to take care of it specifically.
        this._wrap(middlewareStackToPatch, 'clone', this._getV3MiddlewareStackClonePatch.bind(this, moduleVersion));
        this._wrap(middlewareStackToPatch, 'concat', this._getV3MiddlewareStackClonePatch.bind(this, moduleVersion));
    }

    private _getV3MiddlewareStackClonePatch(
        moduleVersion: string,
        original: (...args: unknown[]) => MiddlewareStack<any, any>
    ) {
        const self = this;
        return function (...args: unknown[]) {
            const newStack = original.apply(this, arguments);
            self.patchV3MiddlewareStack(moduleVersion, newStack);
            return newStack;
        };
    }

    private _getV3MiddlewareStackResolvePatch(
        moduleVersion: string,
        original: (_handler: unknown, context: HandlerExecutionContext) => AwsV3MiddlewareHandler<any, any>
    ) {
        const self = this;
        return function (
            _handler: unknown,
            awsExecutionContext: HandlerExecutionContext
        ): AwsV3MiddlewareHandler<any, any> {
            const origHandler = original.apply(this, arguments);
            const patchedHandler = function (command: AwsV3Command<any, any, any, any, any>): Promise<any> {
                const clientConfig = command[storedV3ClientConfig];
                const regionPromise = clientConfig?.region?.();
                const serviceName =
                    clientConfig?.serviceId ?? removeSuffixFromStringIfExists(awsExecutionContext.clientName, 'Client');
                const commandName = awsExecutionContext.commandName ?? command.constructor?.name;
                const normalizedRequest = normalizeV3Request(serviceName, commandName, command.input, undefined);
                const requestMetadata = self.servicesExtensions.requestPreSpanHook(normalizedRequest);
                const span = self._startAwsV3Span(normalizedRequest, requestMetadata, moduleVersion);
                const activeContextWithSpan = trace.setSpan(context.active(), span);

                const handlerPromise = new Promise(async (resolve, reject) => {
                    try {
                        const resolvedRegion = await Promise.resolve(regionPromise);
                        normalizedRequest.region = resolvedRegion;
                        span.setAttribute(AttributeNames.AWS_REGION, resolvedRegion);
                    } catch (e) {
                        // there is nothing much we can do in this case.
                        // we'll just continue without region
                        diag.debug(
                            `${AwsInstrumentation.component} instrumentation: failed to extract region from async function`,
                            e
                        );
                    }

                    self._callUserPreRequestHook(span, normalizedRequest);
                    const resultPromise = context.with(activeContextWithSpan, () => {
                        self.servicesExtensions.requestPostSpanHook(normalizedRequest);
                        return self._callOriginalFunction(() => origHandler.apply(this, arguments));
                    });
                    const promiseWithResponseLogic = resultPromise
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
                            self.servicesExtensions.responseHook(normalizedResponse, span, self.tracer, self._config);
                            self._callUserResponseHook(span, normalizedResponse);
                            return response;
                        })
                        .catch((err) => {
                            const requestId = err?.RequestId;
                            if (requestId) {
                                span.setAttribute(AttributeNames.AWS_REQUEST_ID, requestId);
                            }
                            const extendedRequestId = err?.extendedRequestId;
                            if (extendedRequestId) {
                                span.setAttribute(AttributeNames.AWS_REQUEST_EXTENDED_ID, extendedRequestId);
                            }

                            span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
                            span.recordException(err);
                            throw err;
                        })
                        .finally(() => {
                            span.end();
                        });
                    promiseWithResponseLogic
                        .then((res) => {
                            resolve(res);
                        })
                        .catch((err) => reject(err));
                });

                return requestMetadata.isIncoming
                    ? bindPromise(handlerPromise, activeContextWithSpan, 2)
                    : handlerPromise;
            };
            return patchedHandler;
        };
    }

    private _getRequestSendPatch(moduleVersion: string, original: (callback?: (err: any, data: any) => void) => void) {
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
            const span = self._startAwsV2Span(awsV2Request, requestMetadata, normalizedRequest, moduleVersion);
            awsV2Request[self.REQUEST_SPAN_KEY] = span;
            const activeContextWithSpan = trace.setSpan(context.active(), span);
            const callbackWithContext = context.bind(activeContextWithSpan, callback);

            self._callUserPreRequestHook(span, normalizedRequest);
            self._registerV2CompletedEvent(span, awsV2Request, normalizedRequest, activeContextWithSpan);

            return context.with(activeContextWithSpan, () => {
                self.servicesExtensions.requestPostSpanHook(normalizedRequest);
                return self._callOriginalFunction(() => original.call(awsV2Request, callbackWithContext));
            });
        };
    }

    private _getRequestPromisePatch(moduleVersion: string, original: () => Promise<any>) {
        const self = this;
        return function (): Promise<any> {
            const awsV2Request: AWS.Request<any, any> = this;
            // if the span was already started, we don't want to start a new one when Request.promise() is called
            if (this._asm.currentState === 'complete' || awsV2Request[self.REQUEST_SPAN_KEY]) {
                return original.apply(this, arguments);
            }

            const normalizedRequest = normalizeV2Request(awsV2Request);
            const requestMetadata = self.servicesExtensions.requestPreSpanHook(normalizedRequest);
            const span = self._startAwsV2Span(awsV2Request, requestMetadata, normalizedRequest, moduleVersion);
            awsV2Request[self.REQUEST_SPAN_KEY] = span;

            const activeContextWithSpan = trace.setSpan(context.active(), span);
            self._callUserPreRequestHook(span, normalizedRequest);
            self._registerV2CompletedEvent(span, awsV2Request, normalizedRequest, activeContextWithSpan);

            const origPromise: Promise<any> = context.with(activeContextWithSpan, () => {
                self.servicesExtensions.requestPostSpanHook(normalizedRequest);
                return self._callOriginalFunction(() => original.call(awsV2Request, arguments));
            });

            return requestMetadata.isIncoming ? bindPromise(origPromise, activeContextWithSpan) : origPromise;
        };
    }

    private _callOriginalFunction<T>(originalFunction: (...args: any[]) => T): T {
        if (this._config?.suppressInternalInstrumentation) {
            return context.with(suppressTracing(context.active()), originalFunction);
        } else {
            return originalFunction();
        }
    }
}

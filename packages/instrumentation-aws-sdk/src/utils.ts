import { NormalizedRequest } from './types';
import type { Request } from 'aws-sdk';
import { Context, SpanAttributes, context } from '@opentelemetry/api';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { AttributeNames } from './enums';

const toCamelCase = (str: string): string =>
    typeof str === 'string' ? str.charAt(0).toLowerCase() + str.slice(1) : str;

export const removeSuffixFromStringIfExists = (str: string, suffixToRemove: string): string => {
    const suffixLength = suffixToRemove.length;
    return str?.slice(-suffixLength) === suffixToRemove ? str.slice(0, str.length - suffixLength) : str;
};

export const normalizeV2Request = (awsV2Request: Request<any, any>): NormalizedRequest => {
    const service = (awsV2Request as any)?.service;
    return {
        serviceName: service?.serviceIdentifier?.toLowerCase(),
        commandName: toCamelCase((awsV2Request as any).operation),
        commandInput: (awsV2Request as any).params,
        region: service?.config?.region,
    };
};

export const normalizeV3Request = (
    serviceName: string,
    commandNameWithSuffix: string,
    commandInput: Record<string, any>,
    region: string
): NormalizedRequest => {
    const commandName = toCamelCase(removeSuffixFromStringIfExists(commandNameWithSuffix, 'Command'));
    return {
        serviceName: serviceName?.toLowerCase(),
        commandName,
        commandInput,
        region,
    };
};

export const extractAttributesFromNormalizedRequest = (normalizedRequest: NormalizedRequest): SpanAttributes => {
    return {
        [SemanticAttributes.RPC_SYSTEM]: 'aws-api',
        [SemanticAttributes.RPC_METHOD]: normalizedRequest.commandName,
        [SemanticAttributes.RPC_SERVICE]: normalizedRequest.serviceName,
        [AttributeNames.AWS_REGION]: normalizedRequest.region,
    };
};

export const bindPromise = (
    target: Promise<any>,
    contextForCallbacks: Context,
    rebindCount: number = 1
): Promise<any> => {
    const origThen = target.then;
    target.then = function (onFulfilled, onRejected) {
        const newOnFulfilled = context.bind(onFulfilled, contextForCallbacks);
        const newOnRejected = context.bind(onRejected, contextForCallbacks);
        const patchedPromise = origThen.call(this, newOnFulfilled, newOnRejected);
        return rebindCount > 1 ? bindPromise(patchedPromise, contextForCallbacks, rebindCount - 1) : patchedPromise;
    };
    return target;
};

import { NormalizedRequest } from './types';
import type { Request } from 'aws-sdk';
import { SpanAttributes } from '@opentelemetry/api';
import { RpcAttribute } from '@opentelemetry/semantic-conventions';
import { AttributeNames } from './enums';

const toCamelCase = (str: string): string =>
    typeof str === 'string' ? str.charAt(0).toLowerCase() + str.slice(1) : str;

export const removeSuffixFromStringIfExists = (str: string, suffixToRemove: string): string => {
    const suffixLength = suffixToRemove.length;
    return str?.slice(-suffixLength) === suffixToRemove ? str.slice(0, str.length - suffixLength) : str;
};

export const normalizeV2Request = (awsV2Request: Request<any, any>): NormalizedRequest => {
    return {
        serviceName: (awsV2Request as any)?.service?.serviceIdentifier?.toLowerCase(),
        commandName: toCamelCase((awsV2Request as any).operation),
        commandInput: (awsV2Request as any).params,
        region: (awsV2Request as any)?.config?.region,
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
        region
    };
};

export const extractAttributesFromNormalizedRequest = (normalizedRequest: NormalizedRequest): SpanAttributes => {
    // TODO: replace the hard-coded attributes with semantic-conventions once this PR gets merged and published:
    // https://github.com/open-telemetry/opentelemetry-js/pull/1976#pullrequestreview-600468850
    return {
        'rpc.system': 'aws-api',
        'rpc.method': normalizedRequest.commandName,
        [RpcAttribute.RPC_SERVICE]: normalizedRequest.serviceName,
        [AttributeNames.AWS_REGION]: normalizedRequest.region,
    };
};

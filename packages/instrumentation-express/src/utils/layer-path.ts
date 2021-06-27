import { LayerPath, LayerPathAlternative } from '../types';
import pathRegexp from 'path-to-regexp';
import type express from 'express';

const pathStringToDisplayValue = (pathInput: string, options: express.RouterOptions): string => {
    if (!options.strict && pathInput !== '/' && pathInput.endsWith('/')) {
        return pathInput.substr(0, pathInput.length - 1);
    }
    return pathInput;
};

// get the first argument in calls like router.use('/path', ...),
// handle the various types, and transform regexp to string
const getLayerPathAlternativeFromFirstArg = (
    pathInput: any,
    options
): LayerPathAlternative | LayerPathAlternative[] => {
    if (typeof pathInput === 'string') {
        return {
            userSuppliedValue: pathInput,
            displayValue: pathStringToDisplayValue(pathInput, options),
            regexp: pathRegexp(pathInput, [], options),
        };
    }

    if (pathInput instanceof RegExp)
        return {
            userSuppliedValue: pathInput,
            displayValue: pathInput.toString(),
            regexp: pathRegexp(pathInput, [], options),
        };

    if (Array.isArray(pathInput)) {
        return pathInput.map((alternativePath) => ({
            userSuppliedValue: alternativePath,
            displayValue:
                typeof alternativePath === 'string'
                    ? pathStringToDisplayValue(alternativePath, options)
                    : alternativePath instanceof RegExp
                    ? alternativePath.toString()
                    : undefined,
            regexp: pathRegexp(alternativePath, [], options),
        }));
    }

    return undefined;
};

export const getLayerPathFromFirstArg = (path: any, options: any): LayerPath => {
    const alternatives = getLayerPathAlternativeFromFirstArg(path, options);
    if (!alternatives) return undefined;

    return {
        fastSlash: path === '/',
        alternatives,
        displayValue: Array.isArray(alternatives)
            ? JSON.stringify(alternatives.map((a) => a.displayValue))
            : alternatives.displayValue,
    };
};

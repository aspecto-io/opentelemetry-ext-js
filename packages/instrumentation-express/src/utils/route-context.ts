import { ExpressConsumedRouteState, LayerPath } from '../types';
import type express from 'express';

export const getUsedPathFromLayerPath = (
    layerPath: LayerPath,
    actualUrl: string
): { resolvedPath?: string; error?: string } => {
    if (Array.isArray(layerPath?.alternatives)) {
        const matchedAlternative = layerPath.alternatives.find((alternative) => alternative.regexp.exec(actualUrl));
        if (!matchedAlternative) {
            return { error: 'could not match url path to any of the registered path alternatives' };
        }

        const resolvedPath = matchedAlternative.displayValue;
        if (resolvedPath === undefined) {
            return { error: 'error while resolving path for matched alternative on paths array in express' };
        }
        return { resolvedPath };
        // return layerPath.alternatives.map((alternative) => alternative.displayValue).toString();
    } else {
        const resolvedPath = layerPath?.alternatives?.displayValue;
        if (resolvedPath === undefined) {
            return { error: 'error while resolving path in express' };
        }
        return { resolvedPath };
    }
};

export const consumeLayerPathAndUpdateState = (
    currentParts: ExpressConsumedRouteState,
    req: express.Request,
    currentLayerPath: LayerPath
): ExpressConsumedRouteState => {
    const currentReqPath = req.path;
    const { resolvedPath, error: resolvedPathError } = getUsedPathFromLayerPath(
        currentLayerPath,
        currentParts.remainingRoute
    );

    if (resolvedPathError) {
        return {
            errors: [...(currentParts.errors ?? []), resolvedPathError],
        };
    }
    const layerConfiguredPath = currentLayerPath?.displayValue;

    const remainingRoute = req.route ? '' : currentReqPath === '/' ? '' : currentReqPath;
    const resolvedRoute = !currentLayerPath.fastSlash
        ? currentParts.resolvedRoute + resolvedPath
        : currentParts.resolvedRoute;
    const configuredRoute = !currentLayerPath.fastSlash
        ? currentParts.configuredRoute + layerConfiguredPath
        : currentParts.configuredRoute;
    const params = { ...currentParts.params, ...req.params };

    return {
        resolvedRoute,
        remainingRoute,
        configuredRoute,
        params,
    };
};

export const createInitialRouteState = (req: express.Request): ExpressConsumedRouteState => {
    // at this point, we have the raw http req object, and not the express req.
    // thus, we cannot call req.path
    // we use parseurl(req).pathname which is exactly what express is doing
    const parseurl = eval('require')('parseurl');
    const path = parseurl(req).pathname;
    return { resolvedRoute: '', remainingRoute: path, configuredRoute: '', params: {} };
};

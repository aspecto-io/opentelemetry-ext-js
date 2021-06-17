import { gitSyncDetector } from "."
import fs from 'fs';
import { postInstallFileName } from "./types";

/**
 * Sometimes git database is not available at runtime.
 * Example:
 * - In CI, repo is cloned and built
 * - Code is copied into a docker image which will later run in production.
 *      Since .git folder is not needed at runtime, and it can increase docker image size,
 *      it is not copied to the docker.
 *      node_modules dir is used at runtime and copied to image.
 *
 * We want to be able to have the git data in this case as well.
 * What we do is hooking into the npm install process, running a script at postinstall,
 * which will calculate the resource attributes at the point in time when we do have
 * the .git db, store it into node_modules, and read resource from it later at runtime.
 */
export const persistResourceOnPostInstall = () => {
    const resource = gitSyncDetector.createGitResourceFromGitDb();
    fs.writeFileSync(`./${postInstallFileName}`, JSON.stringify(resource.attributes, null, 2));
}

persistResourceOnPostInstall();
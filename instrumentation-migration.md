# Migrate Instrumentation Library to contrib Repo

## Copy Other Instrumentation as Template
Copy existing instrumentation from `plugins/node` directory (you can use `instrumentation-mongoose` as template)

- update `package.json` to your instrumentation library (including `name`, `dependencies`, `scripts`, `homepage`, `keywords` and anything else that might be related

- update `README.md`. use the contrib template as it's different from `ext-js` template, and just update all the text and links according to your instrumentation.

- `rm CHANGELOG.md`. It will be auto generated on next release.

## src and test Directory
```
mkdir src
mkdir test
```
Copy instrumentation files to `src` and `test` directories and apply changes to make `yarn compile` and `yarn lint:fix` pass successfully.

You should apply the following changes to the files:
- Don't use `moduleVersionAttributeName` from config. Store the value in an hook to make it accessible.
- Use `fooInfo` for hooks configuration. e.g don't use many parameters to hook function signature, use just one parameter and store everything inside.
- Document any breaking changes in the README
- use the new package name in instrumentation constructor

## Test All Versions
If missing, add `.tav.yaml` file and verify `yarn test-all-versions` succeeded for all versions. Check if a new version not in tav is available.

Also check that tav config is aligned with version in instrumentation constructor

## auto-instrumentation-node
Add the instrumentation to auto-instrumentation-node package.
Make sure you add it in all relevant places: `package.json`, `src`, `test`, `release-please-config.json`, `.release-please-manifest.json` and that test is green for the auto instrumentation package.

## Component Owner
Add your name in `.github/component_owners.yml` file.
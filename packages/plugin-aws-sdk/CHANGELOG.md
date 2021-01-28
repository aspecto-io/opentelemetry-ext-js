# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [0.2.0](https://github.com/aspecto-io/opentelemetry-ext-js/compare/opentelemetry-plugin-aws-sdk@0.1.2...opentelemetry-plugin-aws-sdk@0.2.0) (2021-01-28)


### Features

* **aws-sdk:** add suppressInternalInstrumentation config option ([#53](https://github.com/aspecto-io/opentelemetry-ext-js/issues/53)) ([527e266](https://github.com/aspecto-io/opentelemetry-ext-js/commit/527e2664cc3fc3d0e307a69f23529a2ae4ac9d5f))





## 0.1.2 (2021-01-12)


### Bug Fixes

* support otel v0.12.0 context propagation ([#33](https://github.com/aspecto-io/opentelemetry-ext-js/issues/33)) ([5a46fdf](https://github.com/aspecto-io/opentelemetry-ext-js/commit/5a46fdfa9f3677f299b0b848c6bca73a4fd065fe))
* **plugin-aws-sdk:** check messages before accesing start func property ([#31](https://github.com/aspecto-io/opentelemetry-ext-js/issues/31)) ([26b4519](https://github.com/aspecto-io/opentelemetry-ext-js/commit/26b4519678b04d446641454f29ae7587297604c3))
* exception when mapping sqs result to non object value ([#29](https://github.com/aspecto-io/opentelemetry-ext-js/issues/29)) ([5386f75](https://github.com/aspecto-io/opentelemetry-ext-js/commit/5386f7575989467107cb8b3c5ce4f47b28cd9a1a))
* **opentelemetry-plugin-aws-sdk:** add operation to sqs span name following change to the spec ([826b797](https://github.com/aspecto-io/opentelemetry-ext-js/commit/826b7970f3fef931535a5f3ed2a0815158b57e23))
* **opentelemetry-plugin-aws-sdk:** add tests and support more iterations in sqs receive ([ba97daf](https://github.com/aspecto-io/opentelemetry-ext-js/commit/ba97daf54355f629f8db8ab06abe216ebb5b0870))
* **opentelemetry-plugin-aws-sdk:** set aws span as the propagated context ([55f12ae](https://github.com/aspecto-io/opentelemetry-ext-js/commit/55f12ae09dcf63787ea8311268a866614539701b))
* dont add sqs MessageAttribute if we are over the limit ([d276dd7](https://github.com/aspecto-io/opentelemetry-ext-js/commit/d276dd7b6a0cc1975c4103f02e59730e71aa601b))
* inject sqs context per each message in batch ([d307f10](https://github.com/aspecto-io/opentelemetry-ext-js/commit/d307f101cb80cbd5be2788993f67aeedd51648c5))
* log if sqs unable to inject context propagation ([c191bb2](https://github.com/aspecto-io/opentelemetry-ext-js/commit/c191bb2edd978680330b08d3927d9104be9d6c2a))
* **plugin-aws-sdk:** remove unused import ([ba6f797](https://github.com/aspecto-io/opentelemetry-ext-js/commit/ba6f7976e600c9df22a0a0cb73d65cec61a46e0d))
* **plugin-aws-sdk:** set span hierarchy for sqs processing ([e625f41](https://github.com/aspecto-io/opentelemetry-ext-js/commit/e625f41f45fd557b71d8a8cbfe70ba63a6637470))


### Features

* **aws-plugin:** use propagation-utils ([#38](https://github.com/aspecto-io/opentelemetry-ext-js/issues/38)) ([6988f68](https://github.com/aspecto-io/opentelemetry-ext-js/commit/6988f68dd12a5a7b65d790fd594ebd10d1885ab9))
* **plugin-aws-sdk:** add custom attributes hook ([faec15b](https://github.com/aspecto-io/opentelemetry-ext-js/commit/faec15b614072735a9783316b41d63d4c226f291))
* **plugin-aws-sdk:** add span kind to request hook ([fca954f](https://github.com/aspecto-io/opentelemetry-ext-js/commit/fca954f5d8276d0a18c6b217f58ca8aa596f09c3))
* **plugin-aws-sdk:** add span name to request hook ([f1c3dc9](https://github.com/aspecto-io/opentelemetry-ext-js/commit/f1c3dc9e2749552c4f71b3250fee6216b1bcd377))
* **plugin-aws-sdk:** add sqsProcessHook for custom attributes on process span ([#30](https://github.com/aspecto-io/opentelemetry-ext-js/issues/30)) ([8cb41ef](https://github.com/aspecto-io/opentelemetry-ext-js/commit/8cb41ef85f5fc2fe9b8a465c7ce4b0fd3c7b8522))
* **plugin-aws-sdk:** bind promise result to context ([c60a08b](https://github.com/aspecto-io/opentelemetry-ext-js/commit/c60a08b13518b3ebda195b6143719b6a24534bbe))
* **plugin-aws-sdk:** make dynamodb complaint to database client semantic conventions ([#45](https://github.com/aspecto-io/opentelemetry-ext-js/issues/45)) ([b61047d](https://github.com/aspecto-io/opentelemetry-ext-js/commit/b61047dd6d6ebb7ba9773f5fde15760a7df7abef))
* sqs context propagation ([cfbbaa3](https://github.com/aspecto-io/opentelemetry-ext-js/commit/cfbbaa361f0048728cbf110c0af38b144acddf79))
* **plugin-aws-sdk:** bind context to callback on request.send ([3501aad](https://github.com/aspecto-io/opentelemetry-ext-js/commit/3501aad7380c7d8961165f8a3b0039316eb8faaa))
* **plugin-aws-sdk:** bind promise only on incoming operations ([3afffb9](https://github.com/aspecto-io/opentelemetry-ext-js/commit/3afffb9f20b0aec14ae90480e6c5c197225e0713))
* **plugin-aws-sdk:** move aws-sdk plugin to this repository ([95a0312](https://github.com/aspecto-io/opentelemetry-ext-js/commit/95a031278188fca0d43ea1355f85062ced28c728))

# [1.7.0](https://github.com/fsmoothy/fsmoothy/compare/v1.6.0...v1.7.0) (2023-09-28)


### Features

* allow conditional transition ([d873257](https://github.com/fsmoothy/fsmoothy/commit/d873257f0a26547c57ddf4c7ce3a44916d633657))
* get rid of I in interface names ([6d92488](https://github.com/fsmoothy/fsmoothy/commit/6d9248893cc00e1b80e4236771b53905d6c1d796))
* get rid of useless identity transition ([e4a2f64](https://github.com/fsmoothy/fsmoothy/commit/e4a2f64e0da72032751ee1da82854af7f7a099f7))

# [1.6.0](https://github.com/fsmoothy/fsmoothy/compare/v1.5.0...v1.6.0) (2023-09-24)


### Features

* allow async context initialization ([cfd1f6d](https://github.com/fsmoothy/fsmoothy/commit/cfd1f6d8a274c3bcab76c31ead9099b947532633))

# [1.5.0](https://github.com/fsmoothy/fsmoothy/compare/v1.4.1...v1.5.0) (2023-09-24)


### Features

* don't allow to use states as a plain object ([19f5373](https://github.com/fsmoothy/fsmoothy/commit/19f53732ad6c8c852bdf3e2cbcfa1a73a95fa431))

## [1.4.1](https://github.com/fsmoothy/fsmoothy/compare/v1.4.0...v1.4.1) (2023-09-23)


### Bug Fixes

* bind also new subscribers and transitions ([cc240d1](https://github.com/fsmoothy/fsmoothy/commit/cc240d19f10e27dd924fef62a036a19d5dc78aa3))

# [1.4.0](https://github.com/fsmoothy/fsmoothy/compare/v1.3.1...v1.4.0) (2023-09-22)


### Features

* add bind method to bind custom this to callbacks ([b80db66](https://github.com/fsmoothy/fsmoothy/commit/b80db66f673bbd8f56f5d1031bf4cbccea06de0d))

## [1.3.1](https://github.com/fsmoothy/fsmoothy/compare/v1.3.0...v1.3.1) (2023-09-16)


### Bug Fixes

* use internal state for populate events and checkers, remove extra check ([19aedbc](https://github.com/fsmoothy/fsmoothy/commit/19aedbcb5ea7f494cbd9494c8e2b71512144f880))

# [1.3.0](https://github.com/fsmoothy/fsmoothy/compare/v1.2.0...v1.3.0) (2023-09-14)


### Features

* allow add nested fsm dynamically ([1d1bb40](https://github.com/fsmoothy/fsmoothy/commit/1d1bb406bdc611f9994d0a789727cfe9a6c036e7))
* allow to use function for define nested state ([8e6c63e](https://github.com/fsmoothy/fsmoothy/commit/8e6c63e7d478bc4f59ded72e1cede0068c0a2ae5))
* mutate in addTransition method ([a416444](https://github.com/fsmoothy/fsmoothy/commit/a41644469dd4d7a2adf92c83cab3790090fff0f8))
* subscribe to all transitions ([30a509c](https://github.com/fsmoothy/fsmoothy/commit/30a509cfec3fbc0bac923b621fdee1da5893b0da))

# [1.2.0](https://github.com/fsmoothy/fsmoothy/compare/v1.1.0...v1.2.0) (2023-09-07)


### Features

* add All symbol for transitions ([8bb76f0](https://github.com/fsmoothy/fsmoothy/commit/8bb76f08a200706fc9c9385b5a988064649a2e73))
* add identity transition ([9629a62](https://github.com/fsmoothy/fsmoothy/commit/9629a6228a712002f689c0dd4e36a7fe8f55d209))
* add onLeave hook ([a41626b](https://github.com/fsmoothy/fsmoothy/commit/a41626b8c6084f75d31ec4fd196bc9414eba7216))
* implement nested state ([814d454](https://github.com/fsmoothy/fsmoothy/commit/814d4541d49ad689ff37ed6b93d609570553fcc8))

# [1.1.0](https://github.com/fsmoothy/fsmoothy/compare/v1.0.0...v1.1.0) (2023-09-04)


### Features

* overload t function with options ([ff5b32b](https://github.com/fsmoothy/fsmoothy/commit/ff5b32b1ee1b95831912a20dbcd32c9de6566c6b))
* pass event subscribers to init params ([43af296](https://github.com/fsmoothy/fsmoothy/commit/43af296080545ad8ffea31f4714caccc389a5319))
* pass rest args to t ([182dcf2](https://github.com/fsmoothy/fsmoothy/commit/182dcf26ea9dbf19bbf3c1b818b2471f22e45c27))

# 1.0.0 (2023-09-03)


### Features

* migrate fsm to sepparated package ([08bbd77](https://github.com/fsmoothy/fsmoothy/commit/08bbd77c1c972e89dc13f19fc9353c5b92408b71))
* pass params to init ctx function ([0927f1b](https://github.com/fsmoothy/fsmoothy/commit/0927f1b240846314cb606ec446182e3c43114bcc))

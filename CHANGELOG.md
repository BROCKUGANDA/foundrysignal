# Changelog

## [1.1.0](https://github.com/BROCKUGANDA/foundrysignal/compare/v1.0.0...v1.1.0) (2026-11-24)


### Features

* **launch:** commercialization hardening and testability restoration ([8cbf176](https://github.com/BROCKUGANDA/foundrysignal/commit/8cbf1765adbdf1137d53a4e7e7405bfb91045833))


### Bug Fixes

* **ci:** move test postgres to free host port 55435 ([2c0aab2](https://github.com/BROCKUGANDA/foundrysignal/commit/2c0aab2e6984865b0b41ad56db1405ed64bd9e19))
* **ci:** pin bun 1.4.5 to avoid ETXTBSY on the shared VPS runner ([ba2b1ed](https://github.com/BROCKUGANDA/foundrysignal/commit/ba2b1ed1a1b7d68866dc2af1d99677c86bd60ed4))
* **ci:** provide test MFA encryption key ([c7a169e](https://github.com/BROCKUGANDA/foundrysignal/commit/c7a169ef2147865e05175d1426827772903f6a77))
* **deploy:** bind service to freshly built standalone output ([7e910f1](https://github.com/BROCKUGANDA/foundrysignal/commit/7e910f10edaa14b9806077928f44b5d538eec773))
* **deploy:** retry billing readiness after restart; document VPS bun gotcha ([1606bef](https://github.com/BROCKUGANDA/foundrysignal/commit/1606bef292dda3d22bd5400078c72d82acf24556))

## 1.0.0 (2026-11-18)


### Features

* **billing:** renewal loop - pay again extends period, daily sweep with owner reminders, pricing gate requires checkout config ([#7](https://github.com/BROCKUGANDA/foundrysignal/issues/7)) ([8da841d](https://github.com/BROCKUGANDA/foundrysignal/commit/8da841d6f8f9394e70d33efcb517ccbd50bfc06a))


### Bug Fixes

* **deploy:** align to actual VPS layout (app dir, foundrysignal.service drop-in env, no-sudo build, PORT-aware health/billing checks) ([#8](https://github.com/BROCKUGANDA/foundrysignal/issues/8)) ([eb77299](https://github.com/BROCKUGANDA/foundrysignal/commit/eb77299d5d0539fa2e7605ee1b3725f03029f7ca))
* **deps:** sharp 0.34.5 - (CVE-2026-96889, GHSA-rgj7-g3m4-5g8c, GHSA-f88m-g3jw-g9cj) ([#6](https://github.com/BROCKUGANDA/foundrysignal/issues/6)) ([53ce513](https://github.com/BROCKUGANDA/foundrysignal/commit/53ce513514609c3fc778bddb12e2e05bc3aaa846))

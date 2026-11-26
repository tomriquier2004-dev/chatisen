# Changelog

## [0.5.0](https://github.com/tomriquier2004-dev/chatisen/compare/v0.4.0...v0.5.0) (2026-11-26)


### Fonctionnalités

* **api:** add Microsoft Entra ID sign-in ([#137](https://github.com/tomriquier2004-dev/chatisen/issues/137)) ([05f6988](https://github.com/tomriquier2004-dev/chatisen/commit/05f69888f99bb89503a89061501bf0bd87c2ee08))
* **calls:** implement 1-1 WebRTC calls and quality observability ([#124](https://github.com/tomriquier2004-dev/chatisen/issues/124)) ([58d81b7](https://github.com/tomriquier2004-dev/chatisen/commit/58d81b7bd7adac271f22e9701131f6e08cf7b87c))


### Documentation

* **adr:** propose ADR-0017 Cloud SQL for PostgreSQL and record prof guidance ([#135](https://github.com/tomriquier2004-dev/chatisen/issues/135)) ([68ab3ea](https://github.com/tomriquier2004-dev/chatisen/commit/68ab3ea501ce7d4b558093151574ae4d828eda64))
* **adr:** propose ADR-0018 and align ADR-0012, ADR-0016, README and report ([#131](https://github.com/tomriquier2004-dev/chatisen/issues/131)) ([ff122f4](https://github.com/tomriquier2004-dev/chatisen/commit/ff122f40557a57fbbd139db394b57bb273afe1cc))
* **adr:** propose ADR-0021 IAM identities instead of Secret Manager ([#141](https://github.com/tomriquier2004-dev/chatisen/issues/141)) ([a4c3070](https://github.com/tomriquier2004-dev/chatisen/commit/a4c30703731ea76f5e6949e12726309786ba13c7))
* **architecture:** add network flows, J1 and target views, align coturn and hosting ([#126](https://github.com/tomriquier2004-dev/chatisen/issues/126)) ([e81dcaa](https://github.com/tomriquier2004-dev/chatisen/commit/e81dcaaf38bf43073498898010935309d6cd0b78))
* **architecture:** record load balancer and Terraform decisions ([#130](https://github.com/tomriquier2004-dev/chatisen/issues/130)) ([727299e](https://github.com/tomriquier2004-dev/chatisen/commit/727299e88f1f1984e4dacb7ead651fd28ac13660))

## [0.4.0](https://github.com/tomriquier2004-dev/chatisen/compare/v0.3.0...v0.4.0) (2026-11-25)


### Fonctionnalités

* **appels:** add quality anomaly analysis PoC ([#110](https://github.com/tomriquier2004-dev/chatisen/issues/110)) ([9ae32b5](https://github.com/tomriquier2004-dev/chatisen/commit/9ae32b571ab5d0857bd0b408128f9f20de2a47ac))
* **appels:** secure call quality sample ingestion ([#109](https://github.com/tomriquier2004-dev/chatisen/issues/109)) ([9312280](https://github.com/tomriquier2004-dev/chatisen/commit/9312280de2891dd250bdf1030c121104fa5ce19c))
* **infra:** add Caddy entry point, ports test and VM runbook ([#106](https://github.com/tomriquier2004-dev/chatisen/issues/106)) ([b488544](https://github.com/tomriquier2004-dev/chatisen/commit/b4885446bce018acb2654d44505a4a8557b45bc2))
* **web:** add a light/dark theme toggle that follows the system by default ([#104](https://github.com/tomriquier2004-dev/chatisen/issues/104)) ([100b03c](https://github.com/tomriquier2004-dev/chatisen/commit/100b03cef0f87f4d26dd91c31b2723bfc89dff2b))


### Documentation

* **appels:** add WebRTC and Socket.IO ADRs ([#108](https://github.com/tomriquier2004-dev/chatisen/issues/108)) ([f6306cc](https://github.com/tomriquier2004-dev/chatisen/commit/f6306cc285772991260e7c1cd91161bce7915ab2))
* **infra:** record ports and TLS proofs, document IAP SSH restriction ([#113](https://github.com/tomriquier2004-dev/chatisen/issues/113)) ([c39b4e0](https://github.com/tomriquier2004-dev/chatisen/commit/c39b4e02dbba6546ad8eed0f9ad08677468b5608))

## [0.3.0](https://github.com/tomriquier2004-dev/chatisen/compare/v0.2.0...v0.3.0) (2026-11-23)


### Fonctionnalités

* **api:** add conversations and group membership endpoints ([#67](https://github.com/tomriquier2004-dev/chatisen/issues/67)) ([ac66477](https://github.com/tomriquier2004-dev/chatisen/commit/ac66477c0b95c522b66f89c2caf953b73671351f))
* **api:** add last message preview, read receipts and role changes ([#92](https://github.com/tomriquier2004-dev/chatisen/issues/92)) ([0ca88f3](https://github.com/tomriquier2004-dev/chatisen/commit/0ca88f32eb2b2034a1330bf0376f283798254650))
* **api:** add PostgreSQL schema, migrations and readiness probe ([#59](https://github.com/tomriquier2004-dev/chatisen/issues/59)) ([e480979](https://github.com/tomriquier2004-dev/chatisen/commit/e48097998c0a77558e811c80f22ced1b46e26c79))
* **api:** add registration, login, refresh rotation and logout ([#64](https://github.com/tomriquier2004-dev/chatisen/issues/64)) ([b79732e](https://github.com/tomriquier2004-dev/chatisen/commit/b79732e0f92edd562bad2c30b77c912b3e50a98a))
* **api:** add Socket.IO messaging with history and Redis adapter ([#70](https://github.com/tomriquier2004-dev/chatisen/issues/70)) ([c895925](https://github.com/tomriquier2004-dev/chatisen/commit/c895925d1fb9b00dd10fa6892873b3b49f01da77))
* **api:** keep Socket.IO rooms in sync with membership changes ([#75](https://github.com/tomriquier2004-dev/chatisen/issues/75)) ([facd940](https://github.com/tomriquier2004-dev/chatisen/commit/facd940822cfad9111bff565589a96602b300dc0))
* **api:** rate limit authentication and user search ([#86](https://github.com/tomriquier2004-dev/chatisen/issues/86)) ([21141da](https://github.com/tomriquier2004-dev/chatisen/commit/21141daa3c498508362228b312d39d30b3343e70))
* **api:** rate limit Socket.IO messages and connections per user ([#100](https://github.com/tomriquier2004-dev/chatisen/issues/100)) ([02e5cae](https://github.com/tomriquier2004-dev/chatisen/commit/02e5cae8f9844d082bda72268ba489d6c32a3d99))
* **web:** add API client, in-memory session and typed Socket.IO client ([#85](https://github.com/tomriquier2004-dev/chatisen/issues/85)) ([47ca1bc](https://github.com/tomriquier2004-dev/chatisen/commit/47ca1bcb3226a1ce79060857aae47575d6d99354))
* **web:** add chat view with live messages, history and reconnection ([#89](https://github.com/tomriquier2004-dev/chatisen/issues/89)) ([f300565](https://github.com/tomriquier2004-dev/chatisen/commit/f30056533a83d8a0fd51af43db8e9e6f7f5a29e5))
* **web:** add conversation list, creation and group member management ([#93](https://github.com/tomriquier2004-dev/chatisen/issues/93)) ([9b1f447](https://github.com/tomriquier2004-dev/chatisen/commit/9b1f447bf90d9102d5042f4975fdca06e4394f1f))
* **web:** add sign-up and sign-in screens ([#87](https://github.com/tomriquier2004-dev/chatisen/issues/87)) ([21fbe56](https://github.com/tomriquier2004-dev/chatisen/commit/21fbe5612359f62e7753070836a7eeddc9ece339))


### Corrections

* **api:** keep users signed in when two refreshes race ([#84](https://github.com/tomriquier2004-dev/chatisen/issues/84)) ([8c25678](https://github.com/tomriquier2004-dev/chatisen/commit/8c2567899c777e928c73cb85474e925f429bf9c5))
* **api:** map each 4xx status to its error code ([#82](https://github.com/tomriquier2004-dev/chatisen/issues/82)) ([06494f8](https://github.com/tomriquier2004-dev/chatisen/commit/06494f886d423a604ee44ce94204ad7fd14a6754))
* **api:** refuse development defaults on exposed hosts and default cookies to Secure ([#96](https://github.com/tomriquier2004-dev/chatisen/issues/96)) ([5796f05](https://github.com/tomriquier2004-dev/chatisen/commit/5796f05b3865e0715a1cb55f33338d971a7c22e3))
* **api:** scope clientMsgId idempotence to the sender ([#83](https://github.com/tomriquier2004-dev/chatisen/issues/83)) ([b27bf12](https://github.com/tomriquier2004-dev/chatisen/commit/b27bf12766095963faef8af767d23189553e9008))
* **infra:** make the restore test portable to macOS ([#95](https://github.com/tomriquier2004-dev/chatisen/issues/95)) ([37dc66f](https://github.com/tomriquier2004-dev/chatisen/commit/37dc66fde66b08d00c96d9597753da288d1e6d33))
* **infra:** require explicit confirmation before restoring a database ([#94](https://github.com/tomriquier2004-dev/chatisen/issues/94)) ([21c7c9e](https://github.com/tomriquier2004-dev/chatisen/commit/21c7c9e0ac2c0f44ae871289a6b9536b6acc9ef3))
* **web:** reload the conversation list after a reconnection ([#99](https://github.com/tomriquier2004-dev/chatisen/issues/99)) ([8ac4635](https://github.com/tomriquier2004-dev/chatisen/commit/8ac4635d44833e607d6184efe42583b02b49d0f9))


### Documentation

* **adr:** record foundation decisions (client, server, contracts, data, sessions, message order) ([#90](https://github.com/tomriquier2004-dev/chatisen/issues/90)) ([89e053b](https://github.com/tomriquier2004-dev/chatisen/commit/89e053b510a476f9a30d37df4184c2a174ea987f))
* **infra:** propose ADR-0012 on deployment and hosting ([#76](https://github.com/tomriquier2004-dev/chatisen/issues/76)) ([69c428d](https://github.com/tomriquier2004-dev/chatisen/commit/69c428ddc5e511da440bfa1e90cfb2612f89f3f9))
* **infra:** record GCP project setup in ADR-0012 ([#101](https://github.com/tomriquier2004-dev/chatisen/issues/101)) ([ab9ddd0](https://github.com/tomriquier2004-dev/chatisen/commit/ab9ddd09242640cab3876f589b8722a71c1c766d))

## [0.2.0](https://github.com/tomriquier2004-dev/chatisen/compare/v0.1.0...v0.2.0) (2026-11-23)


### Fonctionnalités

* **api:** add minimal Fastify server with liveness probe ([#49](https://github.com/tomriquier2004-dev/chatisen/issues/49)) ([c7d2fc9](https://github.com/tomriquier2004-dev/chatisen/commit/c7d2fc9ed8a2dce6a36ca78c74494f5595ebff64))
* **shared:** add shared contracts package with error format and health schema ([#48](https://github.com/tomriquier2004-dev/chatisen/issues/48)) ([1147795](https://github.com/tomriquier2004-dev/chatisen/commit/1147795a40640a0c0ffa283da445437212a0b033))
* **web:** add Preact + Vite client with design system tokens ([#52](https://github.com/tomriquier2004-dev/chatisen/issues/52)) ([55e7f15](https://github.com/tomriquier2004-dev/chatisen/commit/55e7f154ae1c9d78abbcdc12c3bb982f46025845))

## 0.1.0 (2026-11-23)


### Fonctionnalités

* **infra:** add encrypted PostgreSQL backups with tested restore ([#31](https://github.com/tomriquier2004-dev/chatisen/issues/31)) ([ce6c8f9](https://github.com/tomriquier2004-dev/chatisen/commit/ce6c8f970ece2eb7ebcaa20fe599df019e637a4a))


### Documentation

* add shared agent rules (AGENTS.md, imported by CLAUDE.md) ([#18](https://github.com/tomriquier2004-dev/chatisen/issues/18)) ([7c8a5df](https://github.com/tomriquier2004-dev/chatisen/commit/7c8a5df8a9bc67e586b9d64590a60bf29e75cbb9))
* **agents:** merge Mathys's AGENTS.md proposal with the project rules ([#33](https://github.com/tomriquier2004-dev/chatisen/issues/33)) ([dabfcfd](https://github.com/tomriquier2004-dev/chatisen/commit/dabfcfd6c4ebb46285aedb38303582e50259ebf6))
* **architecture:** describe live room join/leave on membership change ([#30](https://github.com/tomriquier2004-dev/chatisen/issues/30)) ([6dc060a](https://github.com/tomriquier2004-dev/chatisen/commit/6dc060ac041b1261584e0ef778d5405e7b4b4f52))
* **planning:** replan project for the 11 December defence ([#21](https://github.com/tomriquier2004-dev/chatisen/issues/21)) ([87ad2f8](https://github.com/tomriquier2004-dev/chatisen/commit/87ad2f8572e749a9f51b4180518b08634605d30b))
* **prof-qa:** record answers from the meeting ([#19](https://github.com/tomriquier2004-dev/chatisen/issues/19)) ([8a4f730](https://github.com/tomriquier2004-dev/chatisen/commit/8a4f73080a5a4840e9df11de76755d890244ff46))
* **team:** assign Theo to messaging and Mathys to calls ([#14](https://github.com/tomriquier2004-dev/chatisen/issues/14)) ([2a24dc5](https://github.com/tomriquier2004-dev/chatisen/commit/2a24dc5395fe21ab3849630a6b3e0a660b3dffe2))

## Changelog

Ce fichier est tenu à jour par [release-please](https://github.com/googleapis/release-please) à partir des titres de PR mergées sur `main` (Conventional Commits). Ne pas l'éditer à la main : voir [ADR-0014](docs/adr/0014-release-please.md).

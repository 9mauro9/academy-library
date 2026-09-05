# Changelog

## [1.1.0](https://github.com/9mauro9/academy-library/compare/v1.0.0...v1.1.0) (2026-09-05)


### Features

* **auth:** replace email/password auth with Google Sign-In ([df6b76a](https://github.com/9mauro9/academy-library/commit/df6b76ace0310d322189ddf45b8d8ea34645625e))
* **auth:** replace email/password auth with Google Sign-In ([a471883](https://github.com/9mauro9/academy-library/commit/a4718839cd1c403c824c25b5588353f825ba18c6))
* **cms:** OS 2.2 structural upgrade — Firestore-native, admin write guard ([c3acd9c](https://github.com/9mauro9/academy-library/commit/c3acd9c3d5ba65c3f8aaaa9203964bfac296ebd3))
* **cms:** OS 2.2 structural upgrade — Firestore-native, Google auth, admin write guard ([5e1d99f](https://github.com/9mauro9/academy-library/commit/5e1d99f42353eeabe09f90f2a51624e0b0f35df2))
* **cms:** restore original CMS portal with Google auth gate ([0f2d3f0](https://github.com/9mauro9/academy-library/commit/0f2d3f06a82a950ea863484e2286ce66fc528183))
* **cms:** restore original CMS portal with Google auth gate ([bc9022b](https://github.com/9mauro9/academy-library/commit/bc9022be5af4863eb1d949a0d437462c73d68631))
* **i18n:** add Brazilian Portuguese (pt-BR) language support (OS 2.2) ([f15312a](https://github.com/9mauro9/academy-library/commit/f15312a01c84e66959e0cc9a7eaec40d3921e24c))
* **i18n:** implement multilingual system and dynamic subagent standards ([bc916d4](https://github.com/9mauro9/academy-library/commit/bc916d47ffc6e6d458ffae3ba5ba3dcf18360e3c))
* **i18n:** implement multilingual system and dynamic subagent standards ([5947bc3](https://github.com/9mauro9/academy-library/commit/5947bc3fc3acc517e616a1dbc40b3a248874f249))


### Bug Fixes

* **i18n:** expand comprehensive full-screen translations and legal disclaimer modal ([b98ca9c](https://github.com/9mauro9/academy-library/commit/b98ca9c78eea52cbb1366a1e311b655bf55bc08d))
* **i18n:** localize disclaimer trigger badge to Avviso Legale in Italian ([4ac7d64](https://github.com/9mauro9/academy-library/commit/4ac7d6401869147f81b1f2b5b95fed8c1e15d831))
* **i18n:** standardize language selector dropdown styling and UI spec (OS 2.2) ([6b82fef](https://github.com/9mauro9/academy-library/commit/6b82fefcece1ddc855c2b2ebc4e041de5160f308))
* **meta:** correct browser title and package name from Academy Builder to Academy Library ([5f5ec53](https://github.com/9mauro9/academy-library/commit/5f5ec5347f0bf1d7edbd8c6c17876c1e0a07ebd1))
* **meta:** correct browser title and package name from Academy Builder to Academy Library ([d4ae716](https://github.com/9mauro9/academy-library/commit/d4ae716060a26e898772e59817d3e6b2550af566))
* **ui:** replace Academy Builder interface with DataManager CMS view ([ee9c697](https://github.com/9mauro9/academy-library/commit/ee9c697a9e00b77fa336dc7d5ead350708826583))
* **ui:** replace Academy Builder interface with DataManager CMS view ([a83e3f6](https://github.com/9mauro9/academy-library/commit/a83e3f681fe00264adddb4998be370e3b15f6b74))

## 1.0.0 (2026-08-30)


### Features

* add spinning hourglass waiting icon screen to learning path view while path is being generated ([23ccdc0](https://github.com/9mauro9/academy-library/commit/23ccdc04db4cdcc7761a660e9c0ff24da1b695f8))
* add Timeliner Visual Calendar with hierarchical drag-and-drop ([01c5294](https://github.com/9mauro9/academy-library/commit/01c5294c462532ed3866a91182198533f95355b4))
* align project with Parallel Orchestration Workflow (OS 2.0) and integrate Academy Builder dashboard ([1b09f59](https://github.com/9mauro9/academy-library/commit/1b09f591a9c33fe7fca4960b30a1905e575d17aa))
* customize learning paths, bind secrets, target academy-timeliner site, and unify project name to Academy Builder ([e8d39fb](https://github.com/9mauro9/academy-library/commit/e8d39fb065e4277b785d752ef6926dd01c70075b))
* expand similarity search catalog context to 150 items to support multi-day learning path durations, and enforce easiest-to-hardest difficulty sorting ([e288bd8](https://github.com/9mauro9/academy-library/commit/e288bd88ff8fbb5363f1bdabc916583c4f30f7b1))
* implement brand-aligned custom favicon matching the CMS ▲ logo ([19aa761](https://github.com/9mauro9/academy-library/commit/19aa761dbca88ac8f97e65501bc3ff2efbf3ae23))
* implement light / dark theme toggle button at the top left of the header driven by localStorage ([c3b4bd1](https://github.com/9mauro9/academy-library/commit/c3b4bd15cb53332372e72353018198a88e282a62))
* increase similarity search limit and instruct Gemini to construct comprehensive paths matching user target duration ([c5d2492](https://github.com/9mauro9/academy-library/commit/c5d2492c3fcbca85f7c2d4855aa5a761eeb0458f))
* Initial implementation of Academy Library Core CMS with Gemini Ingestion, snapshot rollbacks, and high-performance in-memory cache ([b69da6e](https://github.com/9mauro9/academy-library/commit/b69da6ebdebb7cf958865afd841613adb9ae6a4c))
* **legal:** add standardized Legal Disclaimer modal and header trigger button ([4d7a588](https://github.com/9mauro9/academy-library/commit/4d7a5887f74a9fb32b7fdb3abc37267ee7ddddc2))
* rename Diagnostic Dashboard to Manual Path and AI Architect Panel to AI Path ([e508687](https://github.com/9mauro9/academy-library/commit/e508687ccd0b96b16f9e7744b03423c9b0bf08ae))
* **security:** enforce Firestore multi-tenant isolation and session state cleanup ([8ce1a46](https://github.com/9mauro9/academy-library/commit/8ce1a464fffad2c2edc03a1c79cc61f802b8efc9))
* sort generated learning paths by track weight, then standard lesson sequence order (sorting) ([b126ada](https://github.com/9mauro9/academy-library/commit/b126ada88bd6fc52b11ca99a854afc3c8312c81e))
* sort generated paths by track weight, then sub_track, lesson, topic, and sub_topic indices ([c9e88f8](https://github.com/9mauro9/academy-library/commit/c9e88f8cf35b72fe32892868750c2b991d8fcea9))
* **standardization:** standardize on React 19, Tailwind CSS, and AcademySuiteMenu ([661e87d](https://github.com/9mauro9/academy-library/commit/661e87d8bea23a5bd54d372a3b57267b2286013c))
* update Firestore database targeting to academy-live-db ([7882198](https://github.com/9mauro9/academy-library/commit/7882198324f105f81df5b39b7d95569659f1a6bf))


### Bug Fixes

* add auto-reconnect logic to simulate_triggers Firestore listeners ([28741f7](https://github.com/9mauro9/academy-library/commit/28741f72b0ce6ec1a8845317254a7020ed535433))
* add direct Cloud Firestore fallback data resolution for Academy Library CMS Portal ([9ac46af](https://github.com/9mauro9/academy-library/commit/9ac46aff0381912872ccee8956f042ad29edd67c))
* change header brand subtitle to Personalized Learning Path Builder ([92f08ee](https://github.com/9mauro9/academy-library/commit/92f08ee0b07dea2b7251aedc5905866aaf1c8ae8))
* change loader description from Gemini to We in LearningPathView ([9a182dd](https://github.com/9mauro9/academy-library/commit/9a182dd64c3a3c04e0b887183eb7da71f1351ae5))
* **firestore:** capture orphaned indexes in version control ([987569d](https://github.com/9mauro9/academy-library/commit/987569d68935affc023b84f920cc011615927096))
* isolate firebase hosting target to academy-library public folder and update documentation ([1f22cf5](https://github.com/9mauro9/academy-library/commit/1f22cf5707a007ef3b6cff041d0f6a4db19f8f97))
* override primary button hover background to preserve light gradient and add active class to go dark when depressed ([4060e79](https://github.com/9mauro9/academy-library/commit/4060e79ac6d2284cfc6405c31ca7adff1dfead0c))
* remove sign out button and relocate theme toggle to right side upper header ([250b297](https://github.com/9mauro9/academy-library/commit/250b29704fc97c81b11ad6f580d304b8f5b4b650))
* rename main page title header to Academy Builder ([c5a20c5](https://github.com/9mauro9/academy-library/commit/c5a20c5cb4dcba659846e017c17ab5dd4813d1d7))
* resolve functions emulator spec parsing error by downgrading packages and switch tab routing to CSS display hidden to retain chat history ([9804b65](https://github.com/9mauro9/academy-library/commit/9804b65f7f15363350ee8939a9988732eeb2b099))
* resolve path generation timeout by restarting emulator, relaxing firestore security rules, and clean compiling functions ([8ad3b54](https://github.com/9mauro9/academy-library/commit/8ad3b543b33f80a20d7565814e9e7be0c587436f))
* resolve TS unused variable compilation error and update firebase public folder to dist ([b3e868c](https://github.com/9mauro9/academy-library/commit/b3e868cf1b777691c3c6f53c0a2bc7dae290cfc4))
* use direct HTTPS REST engine for Firestore data access in Academy Library CMS Portal ([5c12a45](https://github.com/9mauro9/academy-library/commit/5c12a457a7f1f44808edfa66ba8331ed62b5448f))

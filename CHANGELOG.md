# Changelog

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

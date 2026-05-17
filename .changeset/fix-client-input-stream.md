---
"@effect-app/vue": patch
---

Fix `client[Key].Input` resolving to `never` for stream request handlers. The extractor only matched `RequestHandlerWithInput`, so any `RequestStreamHandlerWithInput` entry fell through to the `never` branch. Added a parallel `RequestStreamHandlerWithInput` extract so stream Inputs surface the handler's input type.

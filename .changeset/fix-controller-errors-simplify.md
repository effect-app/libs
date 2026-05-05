---
"@effect-app/infra": patch
"effect-app": patch
---

Fix verbose controller handler errors and type explosion in brand types.

- Remove `Simplify` from brand interface declarations (convert to plain intersection type aliases): `NonEmptyString*Brand`, `StringIdBrand`, `UrlBrand`, `Min3String255Brand`, `Int*Brand`, `PositiveNumber*Brand`, `EmailBrand`, `PhoneNumberBrand`. This prevents TypeScript from expanding brand hierarchies in error messages.
- Drop `HandlerWithInputEff` and `HandlerWithInputStream` from controller handler types; only generator functions (`*method() {}`) are now accepted. This eliminates the confusing "overload" errors when a handler yields an error not listed in the schema.
- For stream requests, generator handlers must now `return` a `Stream.Stream` value instead of returning the item type directly. Non-stream handlers are unchanged.
- Update `router3` R-inference to also capture context from the returned stream's R channel.

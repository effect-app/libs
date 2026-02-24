- it looks at node_modules d.ts files instead of repos
- it replaces `Effect.zipRight` with `Effect.andThen` - why?
- what happened to `Config.nested`, why is it replacing with e.g `cups/server`
- Option.match replacement of embedding an Option in Effect, maybe use `.asEffect()`, instead of;
  ```ts
      repo.find(id).pipe(
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.fail(new NotFoundError<ItemType>({ type: repo.itemType, id })),
          onSome: Effect.succeed
        })
      )
    )
  ```
- we can remove `override pipe`
- it's not aware of `asEffect()`:
  ```ts
  Effect
  .gen(function*() {
    return yield* ContextMapContainer
  })
  ```
- it's removing `captureStackTrace: false`  from EFfect.withSpan?
- it's getting confused by multiple effect versions installed, make sure to update all to v4 first and get rid of old patches.

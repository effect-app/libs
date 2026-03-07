# Human findings

- doesn't detect `YieldWrap<Effect<X, Y, Z>>` -> `Yieldable<any, X, Y, Z>`
- missing Reference class support
- it's doing `as any` anyway!
- blatant removing and replacing with `any`:
  - `withDefault: S.PropertySignature<":", string & Brand, never, ":", string, true, never>` 
- it's suddenly confusing `repos/effect` to be v4. maybe better to have it explicit `effect-v3` and `effect-v4`?
- we have to double check `logfmtLogger`, annotations got removed, not sure new manual formatting is great.
- check bs again (make shorter)
  ```ts
  repo.find(id).pipe(
      Effect.flatMap(Option.match({
        onNone: () => Effect.fail(new NotFoundError<ItemType>({ type: repo.itemType, id })),
        onSome: Effect.succeed
      }))
    )
    ```
- double check effect-app changes for `captureStackTrace`, it's not dropped, it's in third argument

## Follow ups

- [ ] RpcMiddlewareV4 - probably get rid of and use official v4 type?
  - [ ] Try to remove all RPC customization apart from dynamic support
- [ ] deal with having to use JSON decode to get Dates back from JSON, and start using S.Date without ISO conversion
  - [ ] update Query accordingly to support actual Date objects!
  - [ ] assess impact on frontend..
- [ ] replace TagId, TagMakeId etc with ServiceMap.Service overloads. 
- [ ] remove unnecessary pipe overrides
- [ ] rename `Default` pattern to `layer` and `DefaultWithoutDependencies` to `layerNoDeps`. also apply to controllers/cli
- [ ] explore `Reference` as not class. I still believe however that it's nice to have the static namespace, we can easily extend. The alternative though is using Object.assign...
- [ ] reconsider `dependencies` setup on controllers/cli.
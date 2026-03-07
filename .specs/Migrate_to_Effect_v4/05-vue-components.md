# Step 5 - vue-components (Effect v4)

## Status

- In progress
- `pnpm check` in `packages/vue-components` currently fails

## What was done

1. Read migration sources before edits:
   - `task/Migrate_to_Effect_v4.md`
   - `task/findings.md`
   - `repos/effect-v4/MIGRATION.md`
   - `repos/effect-v4/packages/effect/SCHEMA.md`
2. Ran initial check in `packages/vue-components` and captured baseline errors.
3. Started migration edits in OmegaForm files:
   - `OmegaAutoGen.vue`
   - `OmegaErrorsInternal.vue`
   - `OmegaFormStuff.ts`
   - `useOmegaForm.ts`

## Current blocker

`OmegaFormStuff.ts` still relies on v3-style schema/AST assumptions (e.g. `TypeLiteral`, `TupleType`, `StringKeyword`, `UndefinedKeyword`, transformation wrapper tags) while v4 AST uses different node names and shapes (`Objects`, `Arrays`, `String`, `Undefined`, etc.), and different annotation APIs.

This means the step is **not** a 1:1 symbol rename. The metadata/default-value extraction logic needs a focused rewrite against v4 AST semantics.

## Additional finding for this package

`packages/vue-components/tsconfig.json` using `moduleResolution: "node"` causes frequent resolution friction with v4 package export maps (`effect/*`).

## Next concrete rewrite plan

1. Rewrite AST helpers (`createMeta`, `metadataFromAst`, `defaultsValueFromSchema`) using v4 `SchemaAST` node model:
   - `Objects` instead of `TypeLiteral`
   - `Arrays` instead of `TupleType`
   - primitive tags like `String`, `Number`, `Undefined`, `Null`
2. Update schema-generation helpers to v4 schema APIs (`annotate`, checks/transforms) where needed.
3. Re-run `pnpm check` and iterate until clean.

# Vue-Components v4 Migration Progress

## Completed

### Core AST Migration
✅ Updated all AST node type checks from v3 to v4:
- `TypeLiteral` → `Objects` (with `isObjects` guard)
- `TupleType` → `Arrays` (with `isArrays` guard)
- `StringKeyword` → `String` (with `isString` guard)
- `BooleanKeyword` → `Boolean` (with `isBoolean` guard)
- `UndefinedKeyword` → `Undefined` (with `isUndefined` guard)
- Removed `Transformation` and `Refinement` AST node checks (these are now stored in `encoding` and `checks` properties)

✅ Updated AST structure access:
- `rest[0].type` → `rest[0]` (arrays store AST directly, not wrapped)
- `propertySignatures` access updated for Objects
- `"propertySignatures" in t` → `AST.isObjects(t)` checks

✅ Updated annotation access:
- `S.AST.getAnnotation(ast, AST.TitleAnnotation Id)` → `ast.annotations?.title`
- `S.AST.getAnnotation(ast, AST.JSONSchemaAnnotationId)` → `ast.annotations?.jsonSchema`

✅ Fixed module imports:
- Removed `SchemaTransformation` import
- Using direct `S` and `AST` imports

✅ Updated helper functions:
- `schemaFromAst` now uses `S.make(ast)` instead of manual construction
- `getNullableOrUndefined` uses `AST.isUndefined` guard
- Array unwrapping uses `AST.isArrays`

✅ Updated type signatures:
- `S.Codec<To, From, R>` → `S.Schema<To, From, R>`
- `S.Top` → `S.Schema<any>`
- `AST.Type[]` → `readonly AST.AST[]`

✅ Fixed Order API:
- `Order.number` → `Order.Number`

## Remaining Work

### Schema Construction API (~58 errors)

The schema generation functions need complete rewrite for v4's API:

#### 1. `generateInputStandardSchemaFromFieldMeta` (lines 820-995)
Issues:
- `S.annotate()` signature changed - returns function, not direct schema
- `S.filterOrFail()` doesn't exist - use `.check()` or similar
- `S.Email` doesn't exist - needs pattern-based validation
- `S.Literal()` signature - use `S.Literal(...values)` not array
- `S.Union()` signature - variadic args not array: `S.Union(s1, s2, s3)`
- `S.NullOr()` usage needs update

Example needed transformation:
```typescript
// v3
schema = S.String.annotations({ message: () => "error" })
  .check(S.isMinLength(1))
  .annotations({ message: () => "empty" })

// v4
schema = S.String.annotate({ message: () => "error" })
schema = S.check(schema, makeMinLengthCheck(1, { message: () => "empty" }))
```

#### 2. `nullableInput` (lines 997-1009)
Issues:
- `S.transformOrFail()` doesn't exist in v4
- Use `S.transform()` with proper signature
- Generic type signatures need fixing

#### 3. `defaultsValueFromSchema` (lines 1055-1199)
Issues:
- `ast.defaultValue` property doesn't exist in v4
- Default values are now in `ast.context?.defaultValue` (per Context class from SchemaAST)
- Needs to check `ast.encoding` for transformation chains

### Other Files

#### useOmegaForm.ts
- Line 805: `Fiber.isRuntimeFiber` doesn't exist in v4
  - Need to find v4 equivalent or use different check
- Line 814: Type mismatch in Fiber.join call

#### utils/index.ts  
- Line 27: Still checking `ast._tag === "Transformation"`
- Need to update `getTransformationFrom` to handle v4 encoding chains

## Recommendations

### Approach 1: Simplify Schema Generation
Instead of dynamically building schemas, consider:
1. Pre-define common validation schemas
2. Use schema composition rather than runtime construction
3. Leverage v4's built-in filters from `@effect/schema/filters`

### Approach 2: Reference Implementation
Look at `@effect-app/vue/form` package which has working v4 patterns:
- `buildFieldInfoFromFieldsRoot` shows proper v4 AST traversal
- Uses composition and declaration patterns  

### Approach 3: Incremental Migration
1. Comment out `generateInputStandardSchemaFromFieldMeta` temporarily  
2. Fix remaining files (useOmegaForm, utils)
3. Get basic type checking passing
4. Then rewrite schema generation with proper v4 API understanding

## Next Steps

Priority order:
1. **Fix utils/index.ts** - Quick win, update getTransformationFrom
2. **Fix useOmegaForm.ts** - Remove/replace Fiber.isRuntimeFiber  
3. **Rewrite generateInputStandardSchemaFromFieldMeta** - Major effort
4. **Update defaultsValueFromSchema** - Use ast.context.defaultValue
5. **Fix nullableInput** - Use v4 transform API

## v4 API Quick Reference

### Schema Construction
```typescript
// Annotations
S.String.annotate({ title: "Username" })  // returns schema directly
S.annotate(S.String, { title: "Username" }) // curried

// Checks/Filters  
S.check(schema, ...checks) // add validation checks

// Union
S.Union(schema1, schema2, schema3) // variadic, not array

// Transform
S.transform(from, to, { decode, encode })
```

### AST Access
```typescript
// Annotations
ast.annotations?.title
ast.annotations?.jsonSchema

// Context (defaults, optionality)
ast.context?.defaultValue  
ast.context?.isOptional

// Encoding (transformations)
ast.encoding?[0].to // follow transformation chain
```

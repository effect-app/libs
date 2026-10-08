import { migrateEffectAppSource } from "effect-app/migration/nativeEffect"
import { describe, expect, test } from "vitest"

describe("migrateEffectAppSource", () => {
  test("rewrites named helpers and keeps the other imports", () => {
    const source = `
import { typedKeysOf, pretty } from "effect-app/utils"
import { tuple } from "effect-app/Function"
import { toBool, fromBool } from "effect-app/Option"

const keys = typedKeysOf(value)
const pair = tuple(keys, pretty(value))
const present = toBool(option)
const flag = fromBool(enabled)
`
    const migrated = migrateEffectAppSource(source)
    expect(migrated).toContain(`import { pretty } from "effect-app/utils"`)
    expect(migrated).toContain(`import { fromBool } from "effect-app/Option"`)
    expect(migrated).toContain(`import * as Struct from "effect/Struct"`)
    expect(migrated).toContain(`import * as Tuple from "effect/Tuple"`)
    expect(migrated).toContain(`import * as Option from "effect/Option"`)
    expect(migrated).toContain("const keys = Struct.keys(value)")
    expect(migrated).toContain("const pair = Tuple.make(keys, pretty(value))")
    expect(migrated).toContain("const present = Option.isSome(option)")
    expect(migrated).toContain("const flag = fromBool(enabled)")
    expect(migrated).not.toContain("typedKeysOf")
    expect(migrated).not.toContain("effect-app/Function")
  })

  test("rewrites aliases, namespaces, calls, and leaves strings and comments", () => {
    const source = `
import { dropUndefined as compact, assertUnreachable as unreachable } from "effect-app/utils"
import * as Dates from "effect-app/_ext/date"
import { chunk_, toNonEmptyArray } from "effect-app/Array"
import { DateValid } from "effect-app/Schema"

// typedKeysOf stays in this comment
const label = "tuple(typedKeysOf)"
const fields = compact({ a: 1, b: undefined })
const next = Dates.DateAddDays(today, 2)
const parts = chunk_(items, 10)
const some = toNonEmptyArray(items)
const Day = DateValid
const missing = unreachable(value)
`
    const migrated = migrateEffectAppSource(source)
    expect(migrated).toContain("// typedKeysOf stays in this comment")
    expect(migrated).toContain(`const label = "tuple(typedKeysOf)"`)
    expect(migrated).toContain("const fields = compact({ a: 1, b: undefined })")
    expect(migrated).toContain("dropUndefined as compact")
    expect(migrated).toContain(
      "const next = DateTime.fromDateUnsafe(today).pipe(DateTime.add({ days: 2 }), DateTime.toDate)"
    )
    expect(migrated).toContain("const parts = Chunk.fromIterable(Array.chunksOf(items, 10))")
    expect(migrated).toContain("const some = Option.liftPredicate(Array.isReadonlyArrayNonEmpty)(items)")
    expect(migrated).toContain(`import { Date } from "effect-app/Schema"`)
    expect(migrated).toContain("const Day = Date")
    expect(migrated).toContain("const missing = absurd(value)")
    expect(migrated).not.toContain("effect-app/_ext/date")
    expect(migrated).not.toContain("DateValid")
  })

  test("rewrites a namespace member and keeps the namespace when it still has other members", () => {
    const source = `
import * as Chunk from "effect-app/Chunk"

const first = Chunk.findFirstSimple(chunk, predicate)
const grouped = Chunk.groupByTChunk_(chunk, key)
`
    const migrated = migrateEffectAppSource(source)
    expect(migrated).toContain(`import * as Chunk from "effect-app/Chunk"`)
    expect(migrated).toContain("const first = Chunk.findFirst(chunk, predicate)")
    expect(migrated).toContain("const grouped = Chunk.groupByTChunk_(chunk, key)")
  })
})

<template>
  <zero.Form :subscribe="['values']">
    <template #default="{ subscribedValues: { values: vvv } }">
      <div>Values zero: <br> {{ vvv }}</div>
    </template>
  </zero.Form>
  <one.Form :subscribe="['values']">
    <template #default="{ subscribedValues: { values: vvv } }">
      <div>Values one: <br> {{ vvv }}</div>
    </template>
  </one.Form>
  <two.Form :subscribe="['values']">
    <template #default="{ subscribedValues: { values: vvv } }">
      <div>Values two: <br> {{ vvv }}</div>
    </template>
  </two.Form>
  <three.Form :subscribe="['values']">
    <template #default="{ subscribedValues: { values: vvv } }">
      <div>Values three: <br> {{ vvv }}</div>
    </template>
  </three.Form>
  <four.Form :subscribe="['values']">
    <template #default="{ subscribedValues: { values: vvv } }">
      <div>Values four: <br> {{ vvv }}</div>
    </template>
  </four.Form>
  <five.Form :subscribe="['values']">
    <template #default="{ subscribedValues: { values: vvv } }">
      <div>Values five: <br> {{ vvv }}</div>
    </template>
  </five.Form>
  <six.Form :subscribe="['values']">
    <template #default="{ subscribedValues: { values: vvv } }">
      <div>Values six: <br> {{ vvv }}</div>
    </template>
  </six.Form>
  <seven.Form :subscribe="['values']">
    <template #default="{ subscribedValues: { values: vvv } }">
      <div>Values seven: <br> {{ vvv }}</div>
    </template>
  </seven.Form>
  <eight.Form :subscribe="['values']">
    <template #default="{ subscribedValues: { values: vvv } }">
      <div>Values eight: <br> {{ vvv }}</div>
    </template>
  </eight.Form>
  <nine.Form :subscribe="['values']">
    <template #default="{ subscribedValues: { values: vvv } }">
      <div>Values nine: <br> {{ vvv }}</div>
    </template>
  </nine.Form>
</template>

<script setup lang="ts">
import { Effect, S } from "effect-app"
import { useOmegaForm } from "../../src/components/OmegaForm"

const struct = {
  a: S.NonEmptyString.pipe(S.withConstructorDefault(Effect.succeed(S.NonEmptyString("default")))),
  b: S.NonEmptyString,
  c: S.NonEmptyArray(S.String).pipe(
    S.withConstructorDefault(Effect.sync(() => [S.NonEmptyString("C"), S.NonEmptyString("Non Empty Array")]))
  ),
  d: S
    .NonEmptyArray(S.Struct({
      e: S.NonEmptyString
    }))
    .pipe(
      S.withConstructorDefault(Effect.sync(() => [{ e: S.NonEmptyString("default") }]))
    ),
  f: S.Union([
    S.Struct({
      _tag: S.Literal("taggo1").pipe(S.withConstructorDefault(Effect.succeed("taggo1"))),
      g: S.NonEmptyString.pipe(S.withConstructorDefault(Effect.succeed(S.NonEmptyString("default")))),
      i: S.NonEmptyString.pipe(S.withConstructorDefault(Effect.succeed(S.NonEmptyString("default"))))
    }),
    S.Struct({
      _tag: S.Literal("taggo2").pipe(S.withConstructorDefault(Effect.succeed("taggo2"))),
      h: S.NonEmptyString.pipe(S.withConstructorDefault(Effect.succeed(S.NonEmptyString("default")))),
      i: S.NonEmptyString.pipe(S.withConstructorDefault(Effect.succeed(S.NonEmptyString("default"))))
    })
  ]),
  j: S.Finite.pipe(S.withConstructorDefault(Effect.succeed(0))),
  k: S.Boolean.pipe(S.withConstructorDefault(Effect.succeed(true))),
  l: S.NullOr(
    S.Union([
      S.Struct({
        a: S.NonEmptyString255,
        common: S.NonEmptyString255,
        _tag: S.Literal("A")
      }),
      S.Struct({
        b: S.NonEmptyString255,
        common: S.NonEmptyString255,
        _tag: S.Literal("B")
      })
    ])
  ),
  m: S.Struct({
    n: S.NullOr(S.Struct({ q: S.String })),
    o: S.UndefinedOr(S.Struct({ q: S.String }))
  }),
  p: S.NullOr(S.Struct({ z: S.String })),
  q: S.UndefinedOr(S.Struct({ z: S.String })),
  r: S
    .NullOr(S.Struct({
      p: S.NullOr(S.Struct({ z: S.String })),
      r: S.UndefinedOr(S.Struct({ z: S.String }))
    }))
    .withDefault,
  s: S.NullOr(S.Struct({ z: S.String })).withDefault,
  t: S.FiniteFromString.pipe(S.withConstructorDefault(Effect.succeed(1000))),
  u: S.NullOr(S.NonEmptyString),
  v: S.UndefinedOr(S.NonEmptyString)
}

class ClassSchema extends S.Class<ClassSchema, any>("ClassSchema")(struct) {}
const schema = S.Struct(struct)

const Union = S.Union([
  S.Struct({
    _tag: S.Literal("tag1").pipe(S.withConstructorDefault(Effect.succeed("tag1"))),
    a: S.NonEmptyString.pipe(S.withConstructorDefault(Effect.succeed(S.NonEmptyString("default")))),
    b: schema
  }),
  S.Struct({
    _tag: S.Literal("tag2"),
    a: S.NonEmptyString.pipe(S.withConstructorDefault(Effect.succeed(S.NonEmptyString("default")))),
    b: S.NonEmptyString.pipe(S.withConstructorDefault(Effect.succeed(S.NonEmptyString("default")))),
    c: schema
  })
])
const zero = useOmegaForm(ClassSchema)
const one = useOmegaForm(schema)
const two = useOmegaForm(Union)

const three = useOmegaForm(schema, {
  defaultValues: {
    a: "aaaaah"
  }
})

const four = useOmegaForm(schema, {
  defaultValues: {
    a: "aaaaah"
  }
}, {
  defaultValuesPriority: ["schema"]
})

const five = useOmegaForm(schema, {
  defaultValues: {
    a: "aaaaah"
  }
}, {
  defaultValuesPriority: ["tanstack"]
})

const six = useOmegaForm(schema, {
  defaultValues: {
    a: "aaaaah"
  }
}, {
  defaultValuesPriority: ["tanstack", "schema"]
})

const seven = useOmegaForm(S.Union([
  S.Struct({
    _tag: S.Literal("tag1").pipe(S.withConstructorDefault(Effect.succeed("tag1"))),
    a: S.NonEmptyString,
    s: S.NullOr(S.Finite).withDefault
  }),
  S.Struct({
    _tag: S.Literal("tag2"),
    b: S.NonEmptyString,
    t: S.Finite
  })
]))

const eight = useOmegaForm(ClassSchema
  .pipe(
    S.check(S.makeFilter((form) => {
      if (form.a !== form.b) {
        return {
          path: ["a"],
          message: "Email and confirmation must match!"
        }
      }
    }))
  ))

const nine = useOmegaForm(ClassSchema.pipe(S.check(S.makeFilter((form) => {
  if (form.a !== form.b) {
    return {
      path: ["a"],
      message: "Email and confirmation must match!"
    }
  }
}))))
</script>

<style scoped>
form {
  margin-bottom: 2rem;
}
</style>

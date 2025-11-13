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
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { useOmegaForm } from "../../src/components/OmegaForm"

const struct = {
  a: S.NonEmptyString.pipe(S.withDefaultConstructor(() => S.NonEmptyString("default"))),
  b: S.NonEmptyString.pipe(S.withDefaultConstructor(() => S.NonEmptyString("default"))),
  c: S.NonEmptyArray(S.String).pipe(
    S.withDefaultConstructor(() => [S.NonEmptyString("C"), S.NonEmptyString("Non Empty Array")])
  ),
  d: S
    .NonEmptyArray(S.Struct({
      e: S.NonEmptyString
    }))
    .pipe(
      S.withDefaultConstructor(() => [{ e: S.NonEmptyString("default") }])
    ),
  f: S.Union(
    S.Struct({
      _tag: S.Literal("tag1").pipe(S.withDefaultConstructor(() => "tag1")),
      g: S.NonEmptyString.pipe(S.withDefaultConstructor(() => S.NonEmptyString("default"))),
      i: S.NonEmptyString.pipe(S.withDefaultConstructor(() => S.NonEmptyString("default")))
    }),
    S.Struct({
      _tag: S.Literal("tag2"),
      h: S.NonEmptyString.pipe(S.withDefaultConstructor(() => S.NonEmptyString("default"))),
      i: S.NonEmptyString.pipe(S.withDefaultConstructor(() => S.NonEmptyString("default")))
    })
  ),
  j: S.Number.pipe(S.withDefaultConstructor(() => 0)),
  k: S.Boolean.pipe(S.withDefaultConstructor(() => true)),
  l: S.NullOr(
    S.Union(
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
    )
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
  s: S.NullOr(S.Struct({ z: S.String })).withDefault
}

class ClassSchema extends S.ExtendedClass<ClassSchema, any>("ClassSchema")(struct) {}

const schema = S.Struct(struct)

const zero = useOmegaForm(ClassSchema)
const one = useOmegaForm(schema)

const two = useOmegaForm(
  S.Union(
    S.Struct({
      _tag: S.Literal("tag1").pipe(S.withDefaultConstructor(() => "tag1")),
      a: S.NonEmptyString.pipe(S.withDefaultConstructor(() => S.NonEmptyString("default"))),
      b: schema
    }),
    S.Struct({
      _tag: S.Literal("tag2"),
      a: S.NonEmptyString.pipe(S.withDefaultConstructor(() => S.NonEmptyString("default"))),
      b: S.NonEmptyString.pipe(S.withDefaultConstructor(() => S.NonEmptyString("default")))
    })
  )
)

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
  defaultFromSchema: "only" // | 'nope' | 'merge'
})

const five = useOmegaForm(schema, {
  defaultValues: {
    a: "aaaaah"
  }
}, {
  defaultFromSchema: "nope"
})

const six = useOmegaForm(schema, {
  defaultValues: {
    a: "aaaaah"
  }
}, {
  defaultFromSchema: "merge"
})
</script>

<style scoped>
form {
  margin-bottom: 2rem;
}
</style>

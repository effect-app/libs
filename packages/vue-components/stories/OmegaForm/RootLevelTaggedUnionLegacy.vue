<template>
  <div>
    <div style="background: #f5f5f5; padding: 20px; margin-bottom: 20px; border-radius: 4px; border-left: 4px solid #e65100">
      <h1 style="margin-top: 0">
        Root-Level TaggedUnion — Legacy Literal Pattern
      </h1>

      <h2>Overview</h2>
      <p>
        Same as the Root-Level TaggedUnion story, but uses the legacy
        <code>S.Struct({ _tag: S.Literal("A"), ... })</code> pattern instead of
        <code>S.TaggedStruct("A", { ... })</code>.
      </p>

      <h2>Known Issue</h2>
      <p>
        After <code>AST.toType</code>, the <code>_tag</code> Literal gets wrapped in a single-element Union (<code
        >Union([Literal("A")])</code>). OmegaForm now unwraps this single-element Union for meta extraction, so <code
        >unionMeta</code> is populated, but using the legacy
        <code>_tag: S.Literal(...)</code> pattern is deprecated and will emit a warning. Prefer <code
        >S.TaggedStruct</code> for new code.
      </p>
    </div>

    <form.Form :subscribe="['values', 'canSubmit']">
      <template #default="{ subscribedValues: { values } }">
        <form.TaggedUnion
          label="Select Type"
          :options="[
            { value: 'A', title: 'Option A' },
            { value: 'B', title: 'Option B' }
          ] as const"
        >
          <!-- Default slot: rendered for ALL branches (common fields) -->
          <!-- In branch A: common is required (NonEmptyString255) -->
          <!-- In branch B: common is nullable (NullOr(String)) -->
          <form.Input
            name="common"
            label="Common Field (required in A, nullable in B)"
          />
          <!-- Named slot #A: rendered only when _tag === "A" -->
          <template #A>
            <form.Input
              name="a"
              label="Field A (string)"
            />
          </template>
          <!-- Named slot #B: rendered only when _tag === "B" -->
          <template #B>
            <form.Input
              name="b"
              label="Field B (number)"
              type="number"
            />
          </template>
        </form.TaggedUnion>
        <pre>values: {{ values }}</pre>
        <pre>unionMeta: {{ JSON.stringify(form.unionMeta, null, 2) }}</pre>
        <form.Errors />
        <v-btn type="submit">
          Submit
        </v-btn>
      </template>
    </form.Form>
  </div>
</template>

<script setup lang="ts">
// TODO: remove the story after manual _tag deprecation
import { S } from "effect-app"
import { useOmegaForm } from "../../src"

// Legacy pattern: S.Struct with _tag: S.Literal instead of S.TaggedStruct.
// After AST.toType, _tag becomes Union([Literal("A")]) instead of Literal("A").
// OmegaForm now unwraps this for unionMeta, but this pattern is deprecated and will warn; prefer S.TaggedStruct.
const schema = S.Union([
  S.Struct({
    _tag: S.Literal("A"),
    a: S.NonEmptyString255.pipe(S.withDefaultConstructor(() => S.NonEmptyString255("aaaa"))),
    common: S.NonEmptyString255
  }),
  S.Struct({
    _tag: S.Literal("B"),
    b: S.Number,
    common: S.NullOr(S.String)
  })
])

const form = useOmegaForm(
  schema,
  {
    onSubmit: async ({ value }) => {
      console.log("Form submitted:", value)
    },
    defaultValues: {
      _tag: "A"
    }
  }
)
</script>

<style scoped>
h1 {
  margin-bottom: 1rem;
}
ul, ol, p {
  margin-left: 1rem;
  margin-bottom: 1rem;
}
code {
  background: #e0e0e0;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: monospace;
}
</style>

<template>
  <div>
    <div style="background: #f5f5f5; padding: 20px; margin-bottom: 20px; border-radius: 4px; border-left: 4px solid #1976d2">
      <h1 style="margin-top: 0">
        Root-Level TaggedUnion Component Usage
      </h1>

      <h2>Overview</h2>
      <p>
        This example demonstrates using a tagged union at the ROOT level of your form schema. The entire form is a
        discriminated union, not nested within a struct.
      </p>

      <h2>Key Differences from Nested Usage</h2>
      <ul>
        <li>
          <strong>No <code>name</code> prop:</strong> Since the union is at the root, omit the <code>name</code> prop
        </li>
        <li>
          <strong>Field paths:</strong> Use direct paths like <code>"a"</code>, <code>"common"</code> instead of
          <code>"union.a"</code>
        </li>
        <li>
          <strong>Schema:</strong> Pass <code>S.Union(...)</code> directly to <code>useOmegaForm</code>, not wrapped in
          <code>S.Struct</code>
        </li>
      </ul>
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
          <form.Input
            name="common"
            label="Common Field (shared by both A and B)"
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
        <pre>{{ values }}</pre>
        <form.Errors />
        <v-btn type="submit">
          Submit
        </v-btn>
      </template>
    </form.Form>
  </div>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { useOmegaForm } from "../../src"

// Root-level union schema - the entire form is a union
const schema = S.Union(
  S.Struct({
    a: S.NonEmptyString255,
    common: S.String,
    _tag: S.Literal("A")
  }),
  S.Struct({
    b: S.Number,
    common: S.String,
    _tag: S.Literal("B")
  })
)

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

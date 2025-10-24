<template>
  <div>
    <div style="background: #f5f5f5; padding: 20px; margin-bottom: 20px; border-radius: 4px; border-left: 4px solid #1976d2">
      <h1 style="margin-top: 0">
        TaggedUnion Component Usage Guide
      </h1>

      <h2>Requirements</h2>
      <ul>
        <li>Your schema MUST use discriminated unions with a <code>_tag</code> field</li>
        <li>
          <strong>ONLY</strong> the <code>_tag</code> field is supported for discrimination (no other field names)
        </li>
      </ul>

      <h2>How it works</h2>
      <ol>
        <li>The component creates a selector for the <code>_tag</code> field</li>
        <li>Based on the selected tag, it renders the corresponding slot</li>
        <li>Named slots match the literal values of <code>_tag</code></li>
      </ol>

      <h3>Slots</h3>
      <ul>
        <li>
          <strong>Default slot:</strong> Rendered for ALL union branches (common fields) only if a tag is selected
        </li>
        <li><strong>Named slots:</strong> Named after each <code>_tag</code> literal value (branch-specific fields)</li>
      </ul>
    </div>

    <form.Form :subscribe="['values', 'canSubmit']">
      <template #default="{ subscribedValues: { values, canSubmit } }">
        <form.Input
          label="aString"
          name="aString"
        />
        <form.TaggedUnion
          name="union"
          label="Union!"
          :options="[
            { value: null, title: 'Select one' },
            { value: 'A', title: 'Option 1' },
            { value: 'B', title: 'Option 2' }
          ]"
        >
          <!-- Default slot: rendered for ALL branches (common fields) -->
          <form.Input
            name="union.common"
            label="Common Field"
          />
          <!-- Named slot #A: rendered only when _tag === "A" -->
          <template #A>
            <form.Input
              name="union.a"
              label="A Field"
            />
          </template>
          <!-- Named slot #B: rendered only when _tag === "B" -->
          <template #B>
            <form.Input
              name="union.b"
              label="B Field"
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

const form = useOmegaForm(
  S.Struct({
    aString: S.String,
    union: S.NullOr(
      S.Union(
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
    )
  }),
  {
    onSubmit: async ({ value }) => {
      console.log("Form submitted:", value)
    }
  }
)
</script>

<style scoped>
h1 {
  margin-bottom: 1rem;
}
ul, ol {
  margin-left: 1rem;
  margin-bottom: 1rem;
}
</style>

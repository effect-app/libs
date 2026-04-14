<template>
  <form.Form :subscribe="['values']">
    <template #default="{ subscribedValues: { values } }">
      <h1>Nullable</h1>
      <p>
        This example demonstrates the use of <code>S.NullOr</code> to allow form fields to be either a specific type or
        null. This is useful for optional fields where you want to explicitly represent the absence of a value.
      </p>
      <ul>
        <li><code>a</code>: Can be either a non-empty string or null.</li>
        <li><code>b</code>: Can be either a string or null.</li>
        <li><code>c</code>: Can be either an object with properties <code>d</code> and <code>e</code>, or null.</li>
      </ul>
      <p>
        When the form is submitted, the values will reflect the user's input, with null representing any fields that
        were left empty.
      </p>
      <form.Input
        label="a (NullOr NonEmptyString)"
        name="a"
      />
      <form.Input
        label="b (NullOr String)"
        name="b"
      />
      <form.Input
        label="c.e (NullOr Struct.e)"
        name="c.e"
      />
      <form.Input
        label="c.d (NullOr Struct.d)"
        name="c.d"
      />
      <form.Field name="c.d">
        <template #default="{ state, field }">
          <div>
            {{ state }}
            <v-text-field
              :name="field.name"
              :label="field.name"
              :model-value="state.value"
              :error="state.meta.errors.length"
              :error-messages="state.meta.errors.map((e) => e.message).filter(Boolean)"
              @update:model-value="field.handleChange"
            />
          </div>
        </template>
      </form.Field>
      <pre>{{ values }}</pre>
      <form.Errors />
      <v-btn type="submit">
        Submit
      </v-btn>
    </template>
  </form.Form>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { useOmegaForm } from "../../src"

const form = useOmegaForm(
  S.Struct({
    a: S.NullOr(S.NonEmptyString).withDefault,
    b: S.NullOr(S.String).withDefault,
    c: S
      .NullOr(S.Struct({
        d: S.NonEmptyString.pipe(S.check(S.isMinLength(20), S.isMaxLength(4000))),
        e: S.String
      }))
      .withDefault
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

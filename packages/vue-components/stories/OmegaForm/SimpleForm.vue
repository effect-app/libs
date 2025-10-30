<template>
  <form.Form :subscribe="['values', 'isDirty', 'canSubmit']">
    <template #default="{ subscribedValues: { values, isDirty, canSubmit } }">
      <div>values: {{ values }} {{ isDirty }} {{ canSubmit }}</div>
      <form.Input
        label="asder2"
        name="errorsFilter"
      >
        <template #default="{ field, label, state }">
          {{ state.value.length }}
          <label :for="field.name">{{ label }}</label>
          <input
            :id="field.name"
            v-model="state.value"
            :name="field.name"
            style="border: 1px solid red"
            @change="(e: any) => field.handleChange(e.target.value ?? '')"
          >
        </template>
      </form.Input>
      <form.Errors />
      <v-btn type="submit">
        submit
      </v-btn>
    </template>
  </form.Form>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { useOmegaForm } from "../../src/components/OmegaForm"

const schema = S.Struct({
  errorsFilter: S.Array(S.Literal("aaa1", "aaa2", "aaa3")),
  queries: S.Struct({
    recapSearchQuery: S.String,
    unsupportedSearchQuery: S.String
  }),
  details: S.Struct({
    showSupported: S.NullOr(S.Literal(0)),
    supportedItemsPerPage: S.Number
  })
})

const form = useOmegaForm(schema, {
  defaultValues: {
    errorsFilter: [],
    queries: {
      recapSearchQuery: "",
      unsupportedSearchQuery: ""
    },
    details: {
      showSupported: null,
      supportedItemsPerPage: 15
    }
  }
}, {
  persistency: {
    policies: ["session"],
    id: "upload-recap-form-state",
    overrideDefaultValues: true
  }
})
</script>

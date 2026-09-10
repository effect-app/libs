<script setup lang="ts">
import * as S from "effect-app/Schema"
import { computed, ref } from "vue"
import { VDataTable } from "vuetify/components"
import { useOmegaForm } from "../../src/components/OmegaForm"

const schema = S.Struct({
  rows: S.Array(S.Struct({
    id: S.String,
    name: S.String,
    text: S.String.pipe(S.check(S.isMinLength(2)))
  }))
})

const submitted = ref(false)
const form = useOmegaForm(schema, {
  defaultValues: {
    rows: Array.from({ length: 14 }, (_, index) => ({
      id: `row-${index + 1}`,
      name: `Row ${String(index + 1).padStart(2, "0")}`,
      text: index === 13 ? "" : `Text ${index + 1}`
    }))
  },
  onSubmit: async () => {
    submitted.value = true
  }
})

const values = form.useStore((state) => state.values)
const items = computed(() => values.value.rows.map((row, sourceIndex) => ({ ...row, sourceIndex })))
const headers = [
  { title: "Row", key: "name" },
  { title: "Text", key: "text", sortable: false }
]
</script>

<template>
  <h2>Editable table with indexed inputs</h2>
  <p class="mb-4">
    Sort the rows or change pages, then edit a text. Changes stay attached to the original row. Row 14 starts empty:
    submit to see its field error and one labelled entry in the error summary. Enter at least two characters to correct
    it.
  </p>
  <form.Form>
    <VDataTable
      :headers="headers"
      :items="items"
      item-value="id"
      :items-per-page="5"
      :items-per-page-options="[5, 10, 20]"
      :sort-by="[{ key: 'name', order: 'desc' }]"
    >
      <template #item.text="{ item }">
        <form.Input
          :name="`rows[${item.sourceIndex}].text`"
          :label="`${item.name} text`"
        />
      </template>
    </VDataTable>
    <form.Errors />
    <v-btn
      type="submit"
      class="my-4"
      @click="submitted = false"
    >
      Submit
    </v-btn>
    <p
      v-if="submitted"
      role="status"
    >
      All rows are valid.
    </p>
    <details>
      <summary>Current form values (original row order)</summary>
      <pre>{{ values }}</pre>
    </details>
  </form.Form>
</template>

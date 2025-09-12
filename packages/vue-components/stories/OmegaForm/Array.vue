<template>
  <OmegaForm
    :form="form"
    :subscribe="['values']"
  >
    <template #externalForm>
      <OmegaArray
        :form="form"
        name="test.Users"
      >
        <template #default="{ index, field }">
          <OmegaInput
            :form="form"
            :name="`test.Users[${index}].name`"
            :label="`name ${index}`"
            :clearable="true"
            @click:clear="() => debouncedClear(() => field.removeValue(index))"
          />
          <form.Input
            :name="`test.Users[${index}].age`"
            :label="`age ${index}`"
          />
        </template>
        <template #field="{ field }">
          <hr>
          <v-btn
            type="button"
            variant="tonal"
            @click="field.pushValue({ name: 'Mario Mario', age: 0 })"
          >
            add
          </v-btn>
        </template>
      </OmegaArray>
      <v-btn
        type="submit"
        variant="plain"
      >
        submit
      </v-btn>
    </template>
  </OmegaForm>
  <br>
  <h2>Passing OmegaArray elements as a prop</h2>
  <OmegaForm
    :form="form2"
    :subscribe="['values']"
  >
    <template #externalForm>
      <OmegaArray
        :form="form2"
        name="string"
        :default-items="randomItems"
      >
        <template #default="{ index }">
          <OmegaInput
            :form="form2"
            :name="`string[${index}]`"
            :label="`string ${index}`"
          />
        </template>
      </OmegaArray>
    </template>
  </OmegaForm>
  <v-btn @click="randomize">
    randomize
  </v-btn>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { onMounted, ref } from "vue"
import { OmegaArray, OmegaForm, OmegaInput, useOmegaForm } from "../../src/components/OmegaForm"

const debounce = <T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void => {
  let timeoutId: NodeJS.Timeout
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => func(...args), delay)
  }
}

const schema = S.Struct({
  test: S.NullOr(
    S.Struct({
      Users: S.NullOr(
        S.mutable(
          S.Array(
            S.Struct({
              name: S.String,
              age: S.NullOr(S.Number.pipe(S.greaterThan(18)))
            })
          )
        )
      )
    })
  )
})

const randomItems = ref<string[]>(["1", "2", "3"])

const randomize = () => {
  randomItems.value = Array.from(
    { length: 3 },
    () => Math.floor(Math.random() * 10).toString()
  )
}

// Debounced clear function because vuetify triggers clear multiple times sometimes
const debouncedClear = debounce((callback: () => void) => {
  callback()
}, 0)

onMounted(() => {
  randomize()
})

const form = useOmegaForm(schema, {
  onSubmit: async (value) => {
    console.log(value)
  }
})

const form2 = useOmegaForm(
  S.Struct({
    string: S.Array(S.String)
  })
)
</script>

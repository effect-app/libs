<template>
  <OmegaForm :form="form" :subscribe="['values']">
    <template #externalForm>
      <OmegaArray :form="form" name="Users">
        <template #default="{ index }">
          <OmegaInput
            :form="form"
            :name="`Users[${index}].name`"
            :label="`name ${index}`"
          />
          <form.Input :name="`Users[${index}].age`" :label="`age ${index}`" />
        </template>
        <template #field="{ field }">
          <v-btn
            type="button"
            variant="tonal"
            @click="field.pushValue({ name: 'Mario Mario', age: 0 })"
          >
            add
          </v-btn>
        </template>
      </OmegaArray>
      <v-btn type="submit" variant="plain">submit</v-btn>
    </template>
  </OmegaForm>
  <br />
  <h2>Passing OmegaArray elements as a prop</h2>
  <OmegaForm :form="form2" :subscribe="['values']">
    <template #externalForm>
      <OmegaArray :form="form2" name="string" :items="randomItems">
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
  <v-btn @click="randomize">randomize</v-btn>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import {
  OmegaForm,
  useOmegaForm,
  OmegaArray,
  OmegaInput,
} from "../../src/components/OmegaForm"
import { onMounted, ref } from "vue"
import { useForm } from "@tanstack/vue-form"

const schema = S.Struct({
  Users: S.mutable(S.Array(
    S.Struct({
      name: S.String,
      age: S.NullOr(S.Number.pipe(S.greaterThan(18))),
    })),
  ),
})

const randomItems = ref<string[]>(["1", "2", "3"])

const randomize = () => {
  randomItems.value = Array.from({ length: 3 }, () =>
    Math.floor(Math.random() * 10).toString(),
  )
}

onMounted(() => {
  randomize()
})

const form = useOmegaForm(schema, {
  defaultValues: {
    Users: [
      { name: "Mario Mario", age: 33 },
      { name: "Luigi Mario", age: 31 },
    ],
  },
  onSubmit: ({ value }) => {
    console.log(value)
  },
})

const form2 = useOmegaForm(
  S.Struct({
    string: S.Array(S.String),
  }),
)
</script>

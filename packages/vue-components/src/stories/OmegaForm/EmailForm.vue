<template>
  <OmegaForm v-bind="args">
    <template #default="{ form }">
      <OmegaInput label="email" name="email" :form="form" />
      <OmegaInput label="confirm" name="confirm" :form="form" />
      <button>submit</button>
      <OmegaErrors />
    </template>
  </OmegaForm>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { OmegaForm, OmegaInput, OmegaErrors } from "../../components/OmegaForm"

const args = {
  schema: S.Struct({
    email: S.Email,
    confirm: S.Email,
  }).pipe(
    S.filter(
      form => {
        if (form.email !== form.confirm) {
          return false
        }
        return true
      },
      {
        message: () => "Email and confirmation must match",
        jsonSchema: {
          items: ["confirm"],
        },
      },
    ),
  ),
  defaultValues: {
    email: "mimmo@asd.it",
    confirm: "amerelli@asd.it",
  },
  onSubmit: ({ value }: { value: { email: string; confirm: string } }) => {
    console.log(value)
  },
}
</script>

<template>
  <OmegaForm
    :schema="schema"
    :default-values="defaultValues"
    @submit="onSubmit"
  >
    <template #internalForm="{ form }">
      <form.Input
        label="email"
        name="email"
      />
      <form.Input
        label="confirm"
        name="confirm"
      />
      <button>submit</button>
      <form.Errors />
    </template>
  </OmegaForm>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { OmegaForm } from "../../src/components/OmegaForm"

const schema = S
  .Struct({
    email: S.Email,
    confirm: S.Email
  })
  .pipe(
    S.filter((form) => {
      if (form.email !== form.confirm) {
        return {
          path: ["confirm"],
          message: "Email and confirmation must match!"
        }
      }
    })
  )

const defaultValues = {
  email: "mimmo@asd.it",
  confirm: "amerelli@asd.it"
}

const onSubmit = (value: { email: string; confirm: string }) => {
  console.log(value)
}
</script>

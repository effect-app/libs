<template>
  <form.Form>
    <OmegaInput
      label="email"
      name="email"
      :form="form"
    />
    <OmegaInput
      label="confirm"
      name="confirm"
      :form="form"
    />
    <v-btn type="submit">
      submit
    </v-btn>
    <form.Errors />
  </form.Form>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { OmegaInput, useOmegaForm } from "../../src/components/OmegaForm"

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

const form = useOmegaForm(schema, {
  defaultValues: {
    email: "mimmo@asd.it",
    confirm: "amerelli@asd.it"
  },
  onSubmit: async (value) => {
    console.log("submit", value)
  }
})
</script>

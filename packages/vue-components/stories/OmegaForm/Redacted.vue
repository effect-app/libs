<template>
  <form.Form>
    <ul>
      <li
        v-for="key in Object.keys(form.meta)"
        :key="key"
      >
        {{ key }}: {{ (form.meta as any)[key] }}
      </li>
    </ul>
    <form.Input
      label="Email"
      name="email"
    />
    <form.Input
      label="Password"
      name="password"
      type="password"
    />
    <form.Input
      label="Secret (plain S.String, not required)"
      name="secret"
      type="password"
    />
    <v-btn type="submit">
      Submit
    </v-btn>
    <form.Errors />
  </form.Form>
  <form2.Form>
    <ul>
      <li
        v-for="key in Object.keys(form.meta)"
        :key="key"
      >
        {{ key }}: {{ (form.meta as any)[key] }}
      </li>
    </ul>
    <form2.Input
      label="Email"
      name="email"
    />
    <form2.Input
      label="Password"
      name="password"
      type="password"
    />
    <v-btn type="submit">
      Submit
    </v-btn>
    <form2.Errors />
  </form2.Form>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { useOmegaForm } from "../../src"

const form = useOmegaForm(
  S.Struct({
    email: S.NonEmptyString255,
    password: S.Redacted(S.NonEmptyString255),
    secret: S.Redacted(S.String)
  }),
  {
    onSubmit: async ({ value }) => {
      console.log("Submitted:", value)
    }
  }
)

class Credentials
  extends S.Class<Credentials>("Credentials")({ email: S.Email, password: S.Redacted(S.NonEmptyString255) })
{}
const form2 = useOmegaForm(Credentials, {
  onSubmit: async ({ value }) => {
    console.log("Submitted:", value)
  }
})
</script>

<template>
  <div class="enter-submit-repro">
    <section>
      <h2>Native Vuetify form</h2>
      <form @submit.prevent="nativeSubmitCount++">
        <v-text-field
          v-model="nativePassword"
          label="Native password"
          type="password"
        />
        <v-btn
          type="submit"
          :disabled="!nativePassword.trim()"
        >
          submit
        </v-btn>
      </form>
      <p>Submit count: {{ nativeSubmitCount }}</p>
    </section>

    <section>
      <h2>OmegaForm Vuetify input</h2>
      <form.Form :subscribe="['values']">
        <template #default="{ subscribedValues: { values } }">
          <form.Input
            label="Omega password"
            name="password"
            type="password"
          />
          <v-btn
            type="submit"
            :disabled="!values.password?.trim()"
          >
            submit
          </v-btn>
        </template>
      </form.Form>
      <p>Submit count: {{ omegaSubmitCount }}</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import * as S from "effect-app/Schema"
import { ref } from "vue"
import { useOmegaForm } from "../../src/components/OmegaForm"

const nativePassword = ref("")
const nativeSubmitCount = ref(0)
const omegaSubmitCount = ref(0)

const form = useOmegaForm(
  S.Struct({
    password: S.NonEmptyString255
  }),
  {
    defaultValues: {
      password: ""
    },
    onSubmit: async () => {
      omegaSubmitCount.value++
    }
  }
)
</script>

<style scoped>
.enter-submit-repro {
  display: grid;
  gap: 24px;
  max-width: 480px;
}

section {
  display: grid;
  gap: 12px;
}
</style>

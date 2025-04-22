<template>
  <OmegaForm
    :schema="
      S.Struct({
        string: S.String,
        number: S.Number,
        boolean: S.Boolean,
        email: S.Email,
        url: S.Url,
        date: S.Date,
      })
    "
  >
    <template #default="{ form }">
      <OmegaAutoGen
        :meta="form.meta"
        :include="['string', 'number']"
        :filter-map="
          a => {
            console.log({ a })
            return form.meta[a]
          }
        "
      />
    </template>
  </OmegaForm>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { OmegaForm, OmegaAutoGen } from "../../components/OmegaForm"
</script>

<template>
  <OmegaForm :form="form" :subscribe="['values']">
    <template #externalForm>
      <OmegaArray name="pippo" :form="form">
        <template #default="{ index }">
          <OmegaInput :form="form" :name="`pippo[${index}].a`" label="a" />
          <OmegaArray :form="form" :name="`pippo[${index}].b`">
            <template #default="{ index:i }">
              <OmegaInput :form="form" :name="`pippo[${index}].b[${i}].c`" label="c" />
            </template>
          </OmegaArray>
        </template>
      </OmegaArray>
    </template>
  </OmegaForm>
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

const schema = S.Struct({
  pippo: S.Array(S.Struct({
    a: S.String,
    b: S.Array(S.Struct({
      c: S.String,
    })),
  })),
  pluto: S.Struct({
    a: S.String,
    b: S.Number,
  }),
})

const form = useOmegaForm(schema, {
  defaultValues: {
    pippo: [
      { a: "1", b: [{ c: "c1" }, { c: "c2" }] },
      { a: "2", b: [{ c: "c3" }, { c: "c4" }] },
    ],
    pluto: {
      a: "a",
      b: 1,
    },
  },
})

</script>

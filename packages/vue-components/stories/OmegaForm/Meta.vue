<template>
  <OmegaForm
    :schema="S.Struct({
      a: S.NullOr(S.String),
      b: S.UndefinedOr(S.Number),
      c: S.NullishOr(S.Number),
      d: S.String,
      e: S.Number,
      f: S.Number,
      struct: S.Struct({
        a: S.NullOr(S.String),
        b: S.UndefinedOr(S.Number),
        c: S.NullishOr(S.Number),
        d: S.String,
        e: S.Number,
        f: S.Number
      }),
      nullableStruct: S.NullOr(
        S.Struct({
          a: S.NullOr(S.String),
          b: S.UndefinedOr(S.Number),
          c: S.NullishOr(S.Number),
          d: S.String,
          e: S.Number,
          f: S.Number
        })
      )
    })"
  >
    <template #internalForm="{ form }">
      <ul>
        <li
          v-for="key in Object.keys(form.meta)"
          :key="key"
        >
          {{ key }}: {{ (form.meta as any)[key] }}
        </li>
      </ul>
      <OmegaInput
        label="a"
        :form="form"
        name="a"
      />
      <OmegaInput
        label="b"
        :form="form"
        name="b"
      />
      <OmegaInput
        label="c"
        :form="form"
        name="c"
      />
      <OmegaInput
        label="d"
        :form="form"
        name="d"
      />
      <OmegaInput
        label="e"
        :form="form"
        name="e"
      />
      <OmegaInput
        label="f"
        :form="form"
        name="f"
      />
      <OmegaInput
        label="struct.a"
        :form="form"
        name="struct.a"
      />
      <OmegaInput
        label="struct.b"
        :form="form"
        name="struct.b"
      />
      <OmegaInput
        label="struct.c"
        :form="form"
        name="struct.c"
      />
      <OmegaInput
        label="struct.d"
        :form="form"
        name="struct.d"
      />
      <OmegaInput
        label="struct.e"
        :form="form"
        name="struct.e"
      />
      <OmegaInput
        label="struct.f"
        :form="form"
        name="struct.f"
      />
    </template>
  </OmegaForm>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { OmegaForm, OmegaInput } from "../../src/components/OmegaForm"
</script>

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
      label="a"
      name="a"
    />
    <form.Input
      label="b"
      name="b"
    />
    <form.Input
      label="c"
      name="c"
    />
    <form.Input
      label="d"
      name="d"
    />
    <form.Input
      label="e"
      name="e"
    />
    <form.Input
      label="f"
      name="f"
    />
    <form.Input
      label="struct.a"
      name="struct.a"
    />
    <form.Input
      label="struct.b"
      name="struct.b"
    />
    <form.Input
      label="struct.c"
      name="struct.c"
    />
    <form.Input
      label="struct.d"
      name="struct.d"
    />
    <form.Input
      label="struct.e"
      name="struct.e"
    />
    <form.Input
      label="struct.f"
      name="struct.f"
    />
  </form.Form>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { useOmegaForm } from "../../src"

const form = useOmegaForm(S.Struct({
  a: S.NullOr(S.String),
  b: S.UndefinedOr(S.Finite),
  c: S.NullishOr(S.Finite),
  d: S.String,
  e: S.Finite,
  f: S.Finite,
  struct: S.Struct({
    a: S.NullOr(S.String),
    b: S.UndefinedOr(S.Finite),
    c: S.NullishOr(S.Finite),
    d: S.String,
    e: S.Finite,
    f: S.Finite
  }),
  nullableStruct: S.NullOr(
    S.Struct({
      a: S.NullOr(S.String),
      b: S.UndefinedOr(S.Finite),
      c: S.NullishOr(S.Finite),
      d: S.String,
      e: S.Finite,
      f: S.Finite
    })
  )
}))
</script>

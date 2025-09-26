<template>
  <form.Form>
    <form.AutoGen
      :pick="['string', 'number', 'email']"
      :sort="Order.mapInput(
        Order.string,
        (
          x: Meta
        ) => x.name
      )"
      :label-map="(a) =>
      Match.value(a).pipe(
        Match.when('string', () => 'a beautiful string'),
        Match.when('number', () => 'a big number'),
        Match.orElse(constUndefined)
      )"
      :filter-map="(a, b) => {
        switch (a) {
          case 'string':
            return {
              ...b,
              label: 'a VERY beautiful string',
              clearable: true
            }
          case 'email':
            return false
          default:
            return { ...b, clearable: true }
        }
      }"
    />
    <v-container>
      <v-row>
        <form.AutoGen
          :omit="['string', 'number', 'email']"
          :order="['date', 'url']"
        >
          <template #default="{ child }">
            <v-col cols="4">
              <form.Input
                :name="child.name"
                :label="child.label"
              />
            </v-col>
          </template>
        </form.AutoGen>
      </v-row>
    </v-container>
  </form.Form>
</template>

<script setup lang="ts">
import { Order } from "effect"
import { Match, S } from "effect-app"
import { constUndefined } from "effect/Function"
import { type OmegaAutoGenMeta, useOmegaForm } from "../../src"

const schema = S.Struct({
  string: S.String,
  number: S.Number,
  boolean: S.Boolean,
  email: S.Email,
  url: S.Url,
  date: S.Date
})
type Meta = OmegaAutoGenMeta<
  typeof schema.Encoded,
  typeof schema.Type
>
const form = useOmegaForm(schema)
</script>

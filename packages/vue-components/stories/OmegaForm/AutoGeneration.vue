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
    <template #internalForm="{ form }">
      <OmegaAutoGen
        :form="form"
        :pick="['string', 'number', 'email']"
        :sort="Order.mapInput(Order.string, x => x.name)"
        :label-map="
          a =>
            Match.value(a).pipe(
              Match.when('string', () => 'a beautiful string'),
              Match.when('number', () => 'a big number'),
              Match.orElse(constUndefined),
            )
        "
        :filter-map="
          (a, b) => {
            switch (a) {
              case 'string':
                return {
                  ...b,
                  label: 'a VERY beautiful string',
                  clearable: true,
                }
              case 'email':
                return false
              default:
                return { ...b, clearable: true }
            }
          }
        "
      />
      <v-container>
        <v-row>
          <OmegaAutoGen
            :form="form"
            :omit="['string', 'number', 'email']"
            :order="['date', 'url']"
          >
            <template #default="{ child }">
              <v-col cols="4">
                <OmegaInput
                  :form="form"
                  :name="child.name"
                  :label="child.label"
                />
              </v-col>
            </template>
          </OmegaAutoGen>
        </v-row>
      </v-container>
    </template>
  </OmegaForm>
</template>

<script setup lang="ts">
import { Match, S } from "effect-app"
import {
  OmegaForm,
  OmegaAutoGen,
  OmegaInput,
} from "../../src/components/OmegaForm"
import { constUndefined } from "effect/Function"
import { Order } from "effect"
</script>

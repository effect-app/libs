<template>
  <h1>Does editing one field wipe the others?</h1>
  <p>
    Each column starts with a record already saved on the server: <code>name</code> and <code>age</code> both
    filled in. The edit dialog below it only exposes <b>name</b>, a narrow edit action that never shows or
    touches <code>age</code>. Click <b>Save</b> without touching <code>age</code> and watch what happens to it
    in the "Saved record" box above.
  </p>
  <div style="display: flex; gap: 2rem; flex-wrap: wrap;">
    <section style="flex: 1; min-width: 320px;">
      <h2>Buggy: plain <code>Struct.omit</code></h2>

      <h3>Saved record (server)</h3>
      <pre>{{ buggyDb }}</pre>

      <h3>Edit dialog (only "name" is editable here)</h3>
      <buggyForm.Form>
        <template #default>
          <buggyForm.Input
            label="name"
            name="name"
          />
          <v-btn type="submit">
            Save
          </v-btn>
        </template>
      </buggyForm.Form>

      <p
        v-if="buggyResult"
        :style="{ color: buggyResult.ageWiped ? 'crimson' : 'seagreen', fontWeight: 'bold' }"
      >
        {{ buggyResult.ageWiped ? "age was wiped by an update that never touched it!" : "age survived the update" }}
      </p>

      <h3>Payload sent to the server</h3>
      <pre>{{ buggyPayload ?? "(not submitted yet)" }}</pre>
    </section>

    <section style="flex: 1; min-width: 320px;">
      <h2>Fixed: <code>S.omitConstructorDefaults</code></h2>

      <h3>Saved record (server)</h3>
      <pre>{{ fixedDb }}</pre>

      <h3>Edit dialog (only "name" is editable here)</h3>
      <fixedForm.Form>
        <template #default>
          <fixedForm.Input
            label="name"
            name="name"
          />
          <v-btn type="submit">
            Save
          </v-btn>
        </template>
      </fixedForm.Form>

      <p
        v-if="fixedResult"
        :style="{ color: fixedResult.ageWiped ? 'crimson' : 'seagreen', fontWeight: 'bold' }"
      >
        {{ fixedResult.ageWiped ? "age was wiped by an update that never touched it!" : "age survived the update" }}
      </p>

      <h3>Payload sent to the server</h3>
      <pre>{{ fixedPayload ?? "(not submitted yet)" }}</pre>
    </section>
  </div>
</template>

<script setup lang="ts">
import * as Effect from "effect-app/Effect"
import * as S from "effect-app/Schema"
import * as Struct from "effect/Struct"
import { ref } from "vue"
import { useOmegaForm } from "../../src"

// `age` carries a constructor default: the field that can leak.
// `name` is plain, no default: the field the edit dialog actually exposes.
const Person = S.Struct({
  name: S.NonEmptyString.pipe(S.optionalKey),
  age: S.Finite.pipe(S.optionalKey, S.withConstructorDefault(Effect.succeed(0)))
})

// The bug: fields carried over by Struct.omit keep their inherited constructor default.
const UpdatePersonBuggy = S.Struct(Struct.omit(Person.fields, [] as const))

// The fix: same fields, constructor defaults stripped.
const UpdatePersonFixed = S.Struct(S.omitConstructorDefaults(Person.fields, [] as const))

// Simulated server state: a record already saved before the edit dialog opens.
const buggyDb = ref<{ name: string; age: number }>({ name: "Acme Corp", age: 30 })
const fixedDb = ref<{ name: string; age: number }>({ name: "Acme Corp", age: 30 })

const buggyResult = ref<{ ageWiped: boolean }>()
const fixedResult = ref<{ ageWiped: boolean }>()

const buggyPayload = ref<unknown>()
const fixedPayload = ref<unknown>()

const buggyForm = useOmegaForm(UpdatePersonBuggy, {
  onSubmit: async ({ value }) => {
    const ageBefore = buggyDb.value.age
    const payload = UpdatePersonBuggy.make(value)
    buggyPayload.value = payload
    // simulates the server applying the update payload as a partial merge (PATCH semantics)
    buggyDb.value = { ...buggyDb.value, ...payload }
    buggyResult.value = { ageWiped: buggyDb.value.age !== ageBefore }
  }
})

const fixedForm = useOmegaForm(UpdatePersonFixed, {
  onSubmit: async ({ value }) => {
    const ageBefore = fixedDb.value.age
    const payload = UpdatePersonFixed.make(value)
    fixedPayload.value = payload
    fixedDb.value = { ...fixedDb.value, ...payload }
    fixedResult.value = { ageWiped: fixedDb.value.age !== ageBefore }
  }
})
</script>

<style scoped>
h1 {
  margin-bottom: 1rem;
}
h3 {
  margin-top: 1rem;
}
</style>

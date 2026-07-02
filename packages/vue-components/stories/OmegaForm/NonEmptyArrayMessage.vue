<template>
  <div class="compare">
    <section>
      <h2>A — <code>S.NonEmptyArray(Row)</code> + annotate</h2>
      <p class="hint">
        In Schema v4 <code>NonEmptyArray(X)</code> desugars to <code>[X, ...Array&lt;X&gt;]</code>: a tuple with one
        required element. When the array is empty the validator reports a <strong>missing required element at
          <code>items[0]</code></strong>, not a container-level error — so the <code>message</code> annotation on the
        field never fires. Clear all rows to see it.
      </p>
      <formA.Form :subscribe="['values', 'errorMap']">
        <template #default="{ subscribedValues: { values, errorMap } }">
          <formA.Array name="items">
            <template #default="{ index, field }">
              <div class="row">
                <formA.Input
                  :name="`items[${index}].name`"
                  :label="`name ${index}`"
                />
                <v-btn
                  type="button"
                  variant="plain"
                  @click="field.removeValue(index)"
                >
                  remove
                </v-btn>
              </div>
            </template>
            <template #field="{ field }">
              <v-btn
                type="button"
                variant="tonal"
                @click="field.pushValue({ name: '' })"
              >
                add row
              </v-btn>
            </template>
          </formA.Array>
          <v-btn type="submit">
            submit
          </v-btn>
          <formA.Errors />
          <pre class="dump">values = {{ values }}
errorMap = {{ errorMap }}</pre>
        </template>
      </formA.Form>
    </section>

    <section>
      <h2>B — <code>S.Array(Row).check(S.isMinLength(1))</code> + annotate</h2>
      <p class="hint">
        Same intent, different encoding. This is a plain <code>Array</code> with a <code>minLength(1)</code> filter, so
        emptiness is a container-level failure and the annotated <code>message</code> appears as expected. Clear all
        rows to compare.
      </p>
      <formB.Form :subscribe="['values', 'errorMap']">
        <template #default="{ subscribedValues: { values, errorMap } }">
          <formB.Array name="items">
            <template #default="{ index, field }">
              <div class="row">
                <formB.Input
                  :name="`items[${index}].name`"
                  :label="`name ${index}`"
                />
                <v-btn
                  type="button"
                  variant="plain"
                  @click="field.removeValue(index)"
                >
                  remove
                </v-btn>
              </div>
            </template>
            <template #field="{ field }">
              <v-btn
                type="button"
                variant="tonal"
                @click="field.pushValue({ name: '' })"
              >
                add row
              </v-btn>
            </template>
          </formB.Array>
          <v-btn type="submit">
            submit
          </v-btn>
          <formB.Errors />
          <pre class="dump">values = {{ values }}
errorMap = {{ errorMap }}</pre>
        </template>
      </formB.Form>
    </section>

    <p class="note">
      Per-element errors (e.g. empty <code>name</code> on a row) work correctly in both variants — the quirk is
      specifically the <em>empty-array</em> case.
    </p>
  </div>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { useOmegaForm } from "../../src/components/OmegaForm"

const Row = S.Struct({
  name: S.String.pipe(S.check(S.isMinLength(2)))
})

const message = "Nessun articolo selezionato da imballare"

const SchemaA = S.Struct({
  items: S.NonEmptyArray(Row).pipe(S.annotate({ message }))
})

const SchemaB = S.Struct({
  items: S.Array(Row).pipe(
    S.check(S.isMinLength(1)),
    S.annotate({ message })
  )
})

// we want an empty array to trigger the error
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const formA = useOmegaForm(SchemaA, { defaultValues: { items: [] as any } })
const formB = useOmegaForm(SchemaB, { defaultValues: { items: [] } })
</script>

<style scoped>
.compare {
  display: grid;
  gap: 1.5rem;
}
section {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 1rem;
}
h2 {
  margin-top: 0;
}
.hint {
  color: #555;
  font-size: 0.9rem;
}
.row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
.row > :first-child {
  flex: 1;
}
.dump {
  background: #f6f6f6;
  padding: 0.5rem;
  border-radius: 4px;
  font-size: 0.8rem;
  white-space: pre-wrap;
  word-break: break-word;
}
.note {
  font-style: italic;
  color: #555;
}
</style>

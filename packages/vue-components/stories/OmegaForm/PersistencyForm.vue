<template>
  <addForm.Form
    :subscribe="['errors', 'values']"
    show-errors-on="onChange"
  >
    <template #default="{ subscribedValues: { errors, values: vvv } }">
      <div>Errors: {{ errors }}</div>
      <div>Values: {{ vvv }}</div>
      <addForm.Input
        label="first"
        name="first"
      />
      <div>+</div>
      <addForm.Input
        label="second"
        name="second"
      />
      <br>
      <hr>
      <br>
      <addForm.Input
        label="third.fourth"
        name="third.fourth"
      />
      <addForm.Input
        label="third.fifth"
        name="third.fifth"
      />
    </template>
  </addForm.Form>

  <!-- Technically you can do this only with a subscribe but only inside OmegaForm Context -->
  <div>
    <div>Sum: {{ sum }}</div>
  </div>
</template>

<script setup lang="ts">
import { Effect, S } from "effect-app"
import { ref, watch } from "vue"
import { useOmegaForm } from "../../src/components/OmegaForm"

const sum = ref(0)
const AddSchema = S.Struct({
  first: S.Finite.pipe(S.withConstructorDefault(Effect.succeed(23))),
  second: S.Finite.pipe(S.check(S.isGreaterThan(3))),
  third: S.Struct({
    fourth: S.Finite,
    fifth: S.Finite
  })
})

const addForm = useOmegaForm(
  AddSchema,
  {
    defaultValues: {
      second: 22
    }
  },
  {
    persistency: {
      policies: ["session"],
      keys: ["first", "second"]
    }
  }
)

const values = addForm.useStore(({ values }) => values)

watch(values, ({ first, second }) => {
  sum.value = first + second
})
</script>

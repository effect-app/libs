<template>
  <form.Form :subscribe="['values']">
    <template #default="{ subscribedValues: { values } }">
      <form.Input
        label="aString"
        name="aString"
      />
      <pre>{{ values }}</pre>
    </template>
  </form.Form>
  <v-btn @click="onScan('print')">
    Simulate user scanning the QR code "print"
  </v-btn>
  <div>
    Latest result:
    <pre>{{ JSON.stringify(latestResult) }}</pre>
  </div>
</template>

<script setup lang="ts">
import { Effect, type Exit, S } from "effect-app"
import { useOmegaForm } from "../../src"
import { ref } from "vue"

const form = useOmegaForm(S.Struct({ aString: S.String.pipe(S.minLength(2)) }))
const scan = Effect.fn(function* (data: string) {
    if (data === "print") {
      // we can respond to the `FormErrors` failure or just short circuit.
      yield* form.handleSubmitEffect({ checkErrors: true })
      alert("Form submitted!") // not called when errors due to shortcircuit
    }
})
const latestResult = ref<Exit.Exit<any, any>>()
const onScan = (data: string) => Effect.runPromise(scan(data).pipe(Effect.exit, Effect.tap(exit => Effect.sync(() => latestResult.value = exit))))
</script>

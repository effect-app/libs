<template>
  <CommandButton :command="cmd" />
  <CommandButton :command="cmd2" />
</template>
<script setup lang="ts">
import { Effect } from "effect"
import { CommandButton } from "./components"
import { Command } from "./helpers"

const mutation = Object.assign(
  Effect.fn(function*() {
    yield* Effect.sleep(1000)
  }),
  { id: "my-mutation" }
)

const cmd = Command.fn(mutation, { disableSharedWaiting: true })(
  function*() {
    yield* mutation()
  }
)

const cmd2 = Command.fn(mutation, { disableSharedWaiting: true })(
  function*() {
    yield* mutation()
  }
)
</script>

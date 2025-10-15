<template>
  <v-table>
    <tr
      v-for="item of items"
      :key="item"
    >
      <td>{{ item }}</td>
      <td>
        <CommandButton :command="updateName(item)" />
        <CommandButton :command="updateState(item)" />
        <CommandButton :command="remove(item)" />
      </td>
    </tr>
  </v-table>
</template>
<script setup lang="ts">
import { Effect } from "effect"
import { CommandButton } from "./components"
import { makeFamily, useCommand } from "./helpers"

const Command = useCommand({
  "action.update_thing": "Update Thing{_isLabel, select, true {} other { {item}}}",
  "action.remove_thing": "Remove Thing{_isLabel, select, true {} other { {item}}}"
})

const items = [
  "one",
  "two"
]

const updateMutation = Object.assign(
  Effect.fn(function*() {
    yield* Effect.sleep(1000)
  }),
  { id: "update_thing" }
)
const removeMutation = Object.assign(
  Effect.fn(function*() {
    yield* Effect.sleep(1000)
  }),
  { id: "remove_thing" }
)

const updateName = makeFamily((item: string) =>
  Command.fn(updateMutation, { state: () => ({ item }), waitKey: item, blockKey: item })(
    function*() {
      yield* updateMutation()
    },
    Command.withDefaultToast()
  )
)

const updateState = makeFamily((item: string) =>
  Command.fn(updateMutation, { state: () => ({ item }), waitKey: item, blockKey: item })(
    function*() {
      yield* updateMutation()
    },
    Command.withDefaultToast()
  )
)

const remove = makeFamily((item: string) =>
  Command.fn(removeMutation, { state: () => ({ item }), waitKey: item, blockKey: item })(
    function*() {
      yield* removeMutation()
    },
    Command.withDefaultToast()
  )
)
</script>

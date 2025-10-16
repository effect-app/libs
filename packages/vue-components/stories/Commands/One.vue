<template>
  <v-btn @click="role = role === 'user' ? 'admin' : 'user'">
    Switch to {{ role === "user" ? "admin" : "user" }}
  </v-btn>
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

  <v-table>
    <tr
      v-for="item of items"
      :key="item"
    >
      <td>{{ item }}</td>
      <td>
        <CommandButton :command="updateName2(item)" />
      </td>
    </tr>
  </v-table>
</template>
<script setup lang="ts">
import { Effect } from "effect"
import { ref } from "vue"
import { CommandButton } from "./components"
import { makeFamily, useCommand } from "./helpers"

const Command = useCommand({
  "action.update_thing": "Update {field}{_isLabel, select, true {} other { {item}}}",
  "action.remove_thing": "Remove {_isLabel, select, true {} other { {item}}}"
})

const items = [
  "one",
  "two"
]

const role = ref<"user" | "admin">("user")

const updateMutation = Object.assign(
  Effect.fn(function*(item: string, props: { name?: string; state?: number }) {
    yield* Effect.sleep(1000)
  }),
  { id: "update_thing" }
)
const removeMutation = Object.assign(
  Effect.fn(function*(item: string) {
    yield* Effect.sleep(1000)
  }),
  { id: "remove_thing" }
)

const updateName = makeFamily((item: string) =>
  Command.fn(updateMutation, {
    state: () => ({ item, field: "name" }),
    waitKey: (id) => `${id}.${item}.name`,
    blockKey: () => `modify_thing.${item}`
  })(
    function*() {
      yield* updateMutation(item, { name: `New name for ${item}` })
    },
    Command.withDefaultToast({ stableToastId: (id) => `${id}.${item}.name` })
  )
)

const updateName2 = makeFamily((item: string) =>
  Command.fn(updateMutation, {
    state: () => ({ item, field: "name" }),
    waitKey: (id) => `${id}.${item}.name`,
    blockKey: () => `modify_thing.${item}`
  })(
    function*() {
      yield* updateMutation(item, { name: `New name for ${item}` })
    },
    Command.withDefaultToast({ stableToastId: (id) => `${id}.${item}.name` })
  )
)

const updateState = makeFamily((item: string) =>
  Command.fn(updateMutation, {
    state: () => ({ item, field: "state" }),
    waitKey: (id) => `${id}.${item}.state`,
    blockKey: () => `modify_thing.${item}`
  })(
    function*() {
      yield* updateMutation(item, { state: Math.floor(Math.random() * 100) })
    },
    Command.withDefaultToast({ stableToastId: (id) => `${id}.${item}.state` })
  )
)

const remove = makeFamily((item: string) =>
  Command.fn(removeMutation, {
    state: () => ({ item }),
    waitKey: (id) => `${id}.${item}`,
    blockKey: () => `modify_thing.${item}`,
    allowed: () => role.value === "admin"
  })(
    function*() {
      yield* removeMutation(item)
    },
    Command.withDefaultToast({ stableToastId: (id) => `${id}.${item}` })
  )
)
</script>

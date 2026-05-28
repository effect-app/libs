<script
  setup
  lang="ts"
  generic="I = never, RA = unknown, RE = unknown"
>
import type { CommandBase, Progress } from "@effect-app/vue/makeClient"
import * as Option from "effect-app/Option"
import type * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { computed } from "vue"
import type { VBtn } from "vuetify/components"

export type VBtnProps = VBtn["$props"]
export interface ButtonProps extends /* @vue-ignore */ VBtnProps {}

const props = defineProps<
  & (
    | {
      input: NoInfer<I>
      optionalInput?: undefined
      command: CommandBase<I, any, RA, RE>
      empty?: boolean
    }
    | {
      optionalInput: Option.Option<NoInfer<I>>
      input?: undefined
      command: CommandBase<I, any, RA, RE>
      empty?: boolean
    }
    | {
      command: CommandBase<any, any, RA, RE>
      input?: undefined
      optionalInput?: undefined
      empty?: boolean
    }
  )
  & {
    disabled?: ButtonProps["disabled"]
    title?: string // why isn't it part of VBtnProps??
    mapProgress?: (result: AsyncResult.AsyncResult<RA, RE>) => Progress | undefined
  }
  & ButtonProps
>()

const resolvedInput = computed<{ _tag: "ready"; value: I } | { _tag: "missing" } | { _tag: "void" }>(() => {
  if ("optionalInput" in props && props.optionalInput !== undefined) {
    return Option.isSome(props.optionalInput)
      ? { _tag: "ready", value: props.optionalInput.value }
      : { _tag: "missing" }
  }
  if ("input" in props && props.input !== undefined) {
    return { _tag: "ready", value: props.input as I }
  }
  return { _tag: "void" }
})

const isDisabled = computed(() =>
  props.command.blocked
  || props.disabled
  || resolvedInput.value._tag === "missing"
)

const resolvedProgress = computed(() => {
  if (props.mapProgress) {
    const result = props.command.result
    return result !== undefined ? props.mapProgress(result) : undefined
  }
  return props.command.progress
})

const progressText = computed(() => {
  const p = resolvedProgress.value
  if (p === undefined) return undefined
  return typeof p === "string" ? p : p.text
})

const progressPercentage = computed(() => {
  const p = resolvedProgress.value
  return typeof p === "object" && p !== null ? p.percentage : undefined
})

const handleClick = () => {
  if (isDisabled.value) return
  const ri = resolvedInput.value
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handle = props.command.handle as any
  if (ri._tag === "ready") handle(ri.value)
  else if (ri._tag === "void") handle(undefined)
  // _tag === "missing" can't reach here — guarded by isDisabled
}
</script>
<script lang="ts">
/**
 * CommandButton connects a command to a button and tracks disabled / loading state.
 *
 * Input variants:
 * - `input`: pass a validated value; button enabled when command + disabled allow it.
 * - `optionalInput`: pass an `Option<I>`. `Some` → enabled, click fires with the value.
 *   `None` → disabled. Use this when the input is gated by a `computed` instead of
 *   a `v-if` on the button itself.
 * - neither: command takes no input.
 */
export default {
  name: "CommandButton"
}
</script>
<template>
  <v-btn
    v-if="command.allowed && !empty"
    v-bind="$attrs"
    :loading="command.waiting"
    :disabled="isDisabled"
    :aria-disabled="isDisabled"
    :title="title ?? command.action"
    :class="{ 'v-btn--disabled': isDisabled }"
    @click="handleClick"
  >
    <template
      v-if="progressText !== undefined"
      #loader
    >
      <v-progress-circular
        :indeterminate="progressPercentage === undefined"
        :model-value="progressPercentage"
        size="20"
        width="2"
      />
      <span class="ml-2">{{ progressText }}</span>
    </template>
    <slot
      :loading="command.waiting"
      :disabled="isDisabled"
      :label="command.label"
      :title="title ?? command.action"
    >
      {{ command.label }}
    </slot>
  </v-btn>
  <v-btn
    v-else-if="command.allowed"
    v-bind="$attrs"
    :loading="command.waiting"
    :disabled="isDisabled"
    :aria-disabled="isDisabled"
    :title="title ?? command.action"
    :class="{ 'v-btn--disabled': isDisabled }"
    @click="handleClick"
  >
    <template
      v-if="progressText !== undefined"
      #loader
    >
      <v-progress-circular
        :indeterminate="progressPercentage === undefined"
        :model-value="progressPercentage"
        size="20"
        width="2"
      />
      <span class="ml-2">{{ progressText }}</span>
    </template>
  </v-btn>
</template>

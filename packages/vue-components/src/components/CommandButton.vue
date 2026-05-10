<script
  setup
  lang="ts"
  generic="I = never, RA = unknown, RE = unknown"
>
import type { CommandBase, Progress } from "@effect-app/vue/makeClient"
import type * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { computed } from "vue"
import type { VBtn } from "vuetify/components"

export type VBtnProps = VBtn["$props"]
export interface ButtonProps extends /* @vue-ignore */ VBtnProps {}

const props = defineProps<
  & (
    | {
      input: NoInfer<I>
      command: CommandBase<I, any, RA, RE>
      empty?: boolean
    }
    | {
      command: CommandBase<any, any, RA, RE>
      input?: undefined
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

const isDisabled = computed(() => props.command.blocked || props.disabled)

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
  // Block execution if button is disabled
  if (isDisabled.value) {
    return
  }

  const input = ("input" in props && props.input
    ? props.input
    : undefined) as unknown as I
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- command.handle has a generic signature mismatched by erased input type
  const handle = props.command.handle as any
  handle(input)
}
</script>
<script lang="ts">
/** Command Button is an easy way to connect commands and have it execute on click, while keeping track of disabled/loading states automatically */
export default {
  name: "CommandButton"
}
</script>
<template>
  <v-btn
    v-if="command.allowed && !empty"
    v-bind="$attrs"
    :loading="command.waiting"
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

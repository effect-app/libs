<script
  setup
  lang="ts"
  generic="I = never"
>
import type { CommandBase } from "@effect-app/vue"
import { computed } from "vue"
import type { VBtn } from "vuetify/components"

export type VBtnProps = VBtn["$props"]
export interface ButtonProps extends /* @vue-ignore */ VBtnProps {}

const props = defineProps<
  & (
    | {
      input: NoInfer<I>
      command: CommandBase<I>
      empty?: boolean
    }
    | {
      command: CommandBase
      input?: undefined
      empty?: boolean
    }
  )
  & {
    disabled?: ButtonProps["disabled"]
    title?: string // why isn't it part of VBtnProps??
  }
  & ButtonProps
>()

const isDisabled = computed(() => props.command.blocked || props.disabled)

const loading = computed<boolean | string>(() => {
  if (!props.command.waiting) return false
  return props.command.progressText ?? true
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
    :loading="loading"
    :aria-disabled="isDisabled"
    :title="title ?? command.action"
    :class="{ 'v-btn--disabled': isDisabled }"
    @click="handleClick"
  >
    <slot
      :loading="loading"
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
    :loading="loading"
    :aria-disabled="isDisabled"
    :title="title ?? command.action"
    :class="{ 'v-btn--disabled': isDisabled }"
    @click="handleClick"
  />
</template>

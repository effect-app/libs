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

const handleClick = () => {
  // Block execution if button is disabled
  if (isDisabled.value) {
    return
  }

  const input = ("input" in props && props.input
    ? props.input
    : undefined) as unknown as I
  ;(props.command.handle as any)(input)
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
    <slot
      :loading="command.waiting"
      :disabled="isDisabled"
      :label="command.label"
      :title="title ?? command.action"
    >
      <span>{{ command.label }}</span>
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
  />
</template>

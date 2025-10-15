<script
  setup
  lang="ts"
  generic="I = never"
>
import type { CommandBase } from "@effect-app/vue"
import type { VBtn } from "vuetify/components"

type VBtnProps = VBtn["$props"]

/* @vue-ignore */
interface ButtonProps extends VBtnProps {}

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
</script>
<script lang="ts">
/** Command Button is an easy way to connect commands and have it execute on click, while keeping track of disabled/loading states automatically */
export default {
  name: "CommandButton"
}
</script>
<template>
  <v-btn
    v-if="!empty"
    v-bind="$attrs"
    :loading="command.waiting"
    :disabled="command.blocked || disabled"
    :title="title ?? command.action"
    @click="(command.handle as any)(
      (`input` in props && props.input
        ? props.input
        : undefined) as unknown as I
    )"
  >
    <slot
      :loading="command.waiting"
      :disabled="command.blocked || disabled"
      :label="command.label"
      :title="title ?? command.action"
    >
      <span>{{ command.label }}</span>
    </slot>
  </v-btn>
  <v-btn
    v-else
    v-bind="$attrs"
    :loading="command.waiting"
    :disabled="command.blocked || disabled"
    :title="title ?? command.action"
    @click="(command.handle as any)(
      (`input` in props && props.input
        ? props.input
        : undefined) as unknown as I
    )"
  />
</template>

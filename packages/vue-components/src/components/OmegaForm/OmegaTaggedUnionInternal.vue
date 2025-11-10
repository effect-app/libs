<template>
  <slot
    v-if="state"
    :name="`${name ? `${name}.` : ''}${state}`"
    v-bind="{ field, state }"
  />
</template>

<script
  setup
  lang="ts"
  generic="
  From extends Record<PropertyKey, any>,
  To extends Record<PropertyKey, any>,
  Name extends DeepKeys<From>
"
>
import { type DeepKeys, type DeepValue } from "@tanstack/vue-form"
import { S } from "effect-app"
import { watch } from "vue"
import { getTransformationFrom } from "../../utils"
import { type OmegaFieldInternalApi } from "./InputProps"
import { type useOmegaForm } from "./useOmegaForm"

const props = defineProps<{
  state: DeepValue<From, Name>
  field: OmegaFieldInternalApi<From, Name>
  name?: DeepKeys<From>
  form: ReturnType<typeof useOmegaForm<From, To>>
}>()

console.log({ name: props.name })
const values = props.form.useStore(({ values }) => values)

// Watch for _tag changes
watch(() => props.state, (newTag, oldTag) => {
  if (newTag === null) {
    props.field.setValue(null as DeepValue<From, Name>)
  }
  if (newTag !== oldTag) {
    if (props.name === void 0 && S.AST.isUnion(props.form._schema.ast)) {
      const members = props
        .form
        ._schema
        .ast
        .types
        .map((t) => getTransformationFrom(t))
        .filter((t) => S.AST.isTypeLiteral(t) || S.AST.isTransformation(t))
        .map((t) => t.propertySignatures)
      console.log("members", members)
    }
    console.log("resetting form", values.value)
    props.form.reset(values.value)
    setTimeout(() => {
      props.field.validate("change")
    }, 0)
  }
})
</script>

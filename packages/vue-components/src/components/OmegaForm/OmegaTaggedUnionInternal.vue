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
import { extractSchemaDefaults } from "./defaultAST"
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

  props.form.reset(values.value)

  if (newTag !== oldTag) {
    // get default values from AST for the new tag (only for root level tagged unions)
    if (props.name === void 0 && S.AST.isUnion(props.form._schema.ast)) {
      const indexOfSelectedMember = props
        .form
        ._schema
        .ast
        .types
        .map((t, i) => ({ original: i, unwrapped: getTransformationFrom(t) }))
        .flatMap((x) =>
          S.AST.isTypeLiteral(x.unwrapped) || S.AST.isTransformation(x.unwrapped)
            ? x
                .unwrapped
                .propertySignatures
                .filter((ps) => S.AST.isLiteral(ps.type) && ps.type.literal === newTag)
                .length > 0
              ? [x.original]
              : []
            : []
        )[0]

      // even if the type doesn't say so, indexOfSelectedMember may be undefined
      if (
        indexOfSelectedMember != void 0
        && "members" in props.form._schema
        && Array.isArray(props.form._schema.members)
      ) {
        const defaultsOfSelectedMember = Object.assign(
          extractSchemaDefaults(
            props
              .form
              ._schema
              .members[indexOfSelectedMember],
            values.value
          ),
          { _tag: newTag }
        )

        props.form.reset(defaultsOfSelectedMember)
      }
    }

    setTimeout(() => {
      props.field.validate("change")
    }, 0)
  }
})
</script>

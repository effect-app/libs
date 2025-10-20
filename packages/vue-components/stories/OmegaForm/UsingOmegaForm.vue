<template>
  <div class="container">
    <h1>Using OmegaForm</h1>
    <p>
      OmegaForm is a powerful and flexible form library that wraps
      <a
        href="https://tanstack.com/form/latest"
        target="_blank"
      >TanStack Form</a>
      and uses
      <a
        href="https://effect.website/docs/schema/introduction/"
        target="_blank"
      >
        Effect Schema
      </a>
      as the schema definition. This allows you to create forms in a declarative way using the compound component
      pattern. We also use
      <a
        href="https://vuetifyjs.com/"
        target="_blank"
      >Vuetify</a> as peer dependency for the UI components, but you can use any other UI library you want or custom
      inputs.
    </p>
    <p>For our examples, we will use the following dependencies:</p>
    <pre v-highlightjs>
<code class="javascript">{{ `import { S } from "effect-app"
import { useOmegaForm, createUseFormWithCustomInput } from "@effect-app/vue-components"` }}</code></pre>

    <h2>Basic Usage</h2>
    <p>First, let's define a schema using Effect Schema:</p>
    <pre v-highlightjs>
<code class="typescript">{{ `const schema = S.Struct({
  name: S.String,
  age: S.Number,
})` }}</code></pre>

    <p>Then, create a form instance using the <code>useOmegaForm</code> hook:</p>
    <pre v-highlightjs><code class="typescript">{{ `const form = useOmegaForm(schema)` }}</code></pre>

    <p>Now you can use the compound component pattern in your template:</p>
    <pre v-highlightjs>
<code class="vue">{{ `<form.Form>
  <form.Input label="name" name="name" />
  <form.Input label="age" name="age" />
</form.Form>` }}</code></pre>

    <h3>Live Example</h3>
    <form.Form>
      <form.Input
        label="name"
        name="name"
      />
      <form.Input
        label="age"
        name="age"
      />
    </form.Form>

    <h2>Subscribing to Form Values</h2>
    <p>You can subscribe to form values using the <code>subscribe</code> prop:</p>
    <pre v-highlightjs>
<code class="vue">{{ `<form.Form :subscribe="['values']">
  <template #default="{ subscribedValues: { values } }">
    <form.Input label="name" name="name" />
    <form.Input label="age" name="age" />
    <pre>\{\{ values \}\}</pre>
  </template>
</form.Form>` }}</code></pre>

    <h3>Live Example with Subscribed Values</h3>
    <form.Form :subscribe="['values']">
      <template #default="{ subscribedValues: { values } }">
        <form.Input
          label="name"
          name="name"
        />
        <form.Input
          label="age"
          name="age"
        />
        <pre>{{ values }}</pre>
      </template>
    </form.Form>

    <h2>Using Custom Inputs</h2>
    <p>
      You can use custom inputs by providing a default slot to <code>form.Input</code>:
    </p>
    <pre v-highlightjs>
<code class="vue">{{ `<form.Form>
  <form.Input label="name" name="name">
    <template #default="{ field, state, label }">
      <label :for="field.name">\{\{ label \}\}</label>
      <input
        :id="field.name"
        v-model="state.value"
        :name="field.name"
        style="border: 1px solid red"
        @change="(e) => field.handleChange(e.target.value)"
      />
    </template>
  </form.Input>
</form.Form>` }}</code></pre>

    <h3>Live Example with Custom Input</h3>
    <form.Form>
      <form.Input
        label="name"
        name="name"
      >
        <template #default="{ field, label, state }">
          <label :for="field.name">{{ label }}</label>
          <input
            :id="field.name"
            v-model="state.value"
            :name="field.name"
            style="border: 1px solid red"
            @change="(e: any) => field.handleChange(e.target.value)"
          >
        </template>
      </form.Input>
    </form.Form>

    <h2>Creating a Custom useForm Hook</h2>
    <p>
      For larger applications, you may want to create your own <code>useForm</code> hook with a custom input component.
      This is useful when you want to use a UI library other than Vuetify or apply consistent styling across all forms.
    </p>

    <h3>Define Your Custom Input Component</h3>
    <p>First, create a custom input component that accepts the <code>InputProps</code> type:</p>
    <pre v-highlightjs>
<code class="vue">{{ `<template>
  <div>
    <label :for="field.name">\{\{ inputProps.label \}\}</label>
    <input
      :id="field.name"
      :name="field.name"
      :value="state.value"
      @change="(e) => field.handleChange(e.target.value)"
    >
    <span v-if="inputProps.error">
      \{\{ inputProps.errorMessages.join(", ") \}\}
    </span>
  </div>
</template>

<script setup lang="ts" generic="From extends Record<PropertyKey, any>, Name extends DeepKeys<From>">
import type { DeepKeys } from "@tanstack/vue-form"
import type { InputProps } from "@effect-app/vue-components"

defineProps<InputProps<From, Name>>()

defineEmits<{
  (e: "focus", event: Event): void
  (e: "blur", event: Event): void
}>()

defineOptions({
  inheritAttrs: false
})
</script>` }}</code></pre>

    <h3>Create Your Custom useForm Hook</h3>
    <p>Then, use <code>createUseFormWithCustomInput</code> to create a custom hook:</p>
    <pre v-highlightjs>
<code class="typescript">{{ `import { createUseFormWithCustomInput } from "@effect-app/vue-components"
import CustomInput from "./CustomInput.vue"

export const useForm = createUseFormWithCustomInput(CustomInput)` }}</code></pre>

    <h3>Use Your Custom Hook</h3>
    <p>Now you can use your custom <code>useForm</code> hook throughout your application:</p>
    <pre v-highlightjs>
<code class="vue">{{ `<script setup lang="ts">
import { S } from "effect-app"
import { useForm } from "./composables/useForm"

const schema = S.Struct({
  name: S.String,
  age: S.Number
})

const form = useForm(schema, {
  onSubmit: async ({ value }) => {
    console.log(value)
  }
})
</script>

<template>
  <form.Form>
    <form.Input label="Name" name="name" />
    <form.Input label="Age" name="age" />
    <button type="submit">Submit</button>
  </form.Form>
</template>` }}</code></pre>

    <h3>Advanced: Custom Input Props</h3>
    <p>
      You can extend the input props to add custom properties like custom types or options:
    </p>
    <pre v-highlightjs>
<code class="typescript">{{ `import type { InputProps as OmegaInputProps } from "@effect-app/vue-components"

// Define custom type props
export type TypeProps = {
  type?: "text" | "email" | "color"
  options?: undefined
} | {
  type?: "select" | "radio"
  options?: {
    title: string
    value: string | number
  }[]
}

// Extend the InputProps type
export type InputProps<From extends Record<PropertyKey, any>, TName extends string> =
  OmegaInputProps<From, TName> & { inputProps: TypeProps }

// Create the custom hook with typed props
export const useForm = createUseFormWithCustomInput<TypeProps>(CustomInput)` }}</code></pre>

    <h2>Key Concepts</h2>
    <ul>
      <li>
        <strong>Compound Component Pattern:</strong> The <code>useOmegaForm</code> hook returns a form instance with
        nested components like <code>Form</code> and <code>Input</code>
      </li>
      <li><strong>Type Safety:</strong> The schema definition ensures type safety throughout the form</li>
      <li><strong>Flexibility:</strong> You can use built-in Vuetify components or provide your own custom inputs</li>
      <li><strong>Reactive Values:</strong> Subscribe to form state changes using the <code>subscribe</code> prop</li>
      <li>
        <strong>Custom Hooks:</strong> Use <code>createUseFormWithCustomInput</code> to create reusable form hooks with
        custom input components
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { useOmegaForm } from "../../src/components/OmegaForm"

const schema = S.Struct({
  name: S.String,
  age: S.Number
})
const form = useOmegaForm(schema)
</script>

<style scoped>
p,
pre {
  margin-bottom: 1rem;
}
form {
  margin-bottom: 2rem;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1rem;
}

h1, h2, h3 {
  text-wrap: balance;
}

ul {
  margin-bottom: 1rem;
  padding-left: 1.5rem;
}

li {
  margin-bottom: 0.5rem;
}
</style>

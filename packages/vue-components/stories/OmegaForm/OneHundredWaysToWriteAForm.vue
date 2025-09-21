<template>
  <div class="container">
    <h1>One hundred ways to write a form</h1>
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
      as the schema definition. All of this allows you to create forms in a declarative way. We also use
      <a
        href="https://vuetifyjs.com/"
        target="_blank"
      >Vuetify</a> as peer dependency for the UI components, but you can use any other UI library you want or custom
      inputs. Here are some examples of how to write forms using different approaches
    </p>
    <p>for our example, we will use the following dependencies</p>
    <pre v-highlightjs>
<code class="javascript">{{ `import { S } from "effect-app"
import { OmegaForm, OmegaInput, useOmegaForm } from "@effect-app/vue-components"` }}</code></pre>

    <h2>Simplest way</h2>
    <p>Now, let's write a form using the following schema:</p>
    <pre v-highlightjs>
<code class="typescript">{{ `const schema = S.Struct({
  name: S.String,
  age: S.Number,
})` }}</code></pre>

    <p>Now, let's write in the template the form using the following schema:</p>
    <pre v-highlightjs>
<code class="vue">{{ `<OmegaForm :schema="schema" :on-submit="console.log">
  <template #internalForm="{ form }">
    <OmegaInput label="name" :form="form" name="name" />
    <OmegaInput label="age" :form="form" name="age" />
  </template>
</OmegaForm>` }}</code></pre>

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

    <p>
      <code>OmegaInput</code>
      is a component that will render a form input based on the schema. It's alread embedded inside the
      <code>OmegaForm</code>
      component, so you don't need to import it separately or pass form as a prop:
    </p>
    <pre v-highlightjs>
<code class="vue">{{ `<OmegaForm :schema="schema">
  <template #internalForm="{ form }">
    <component :is="form.Input" label="name" name="name" />
    <component :is="form.Input" label="age" name="age" />
  </template>
</OmegaForm>` }}</code></pre>
    <p>you can also register to the values via the `subscribe` prop</p>
    <pre v-highlightjs>
<code class="vue">{{ `<OmegaForm :schema="schema" :subscribe="['values']">
    <template #internalForm="{ form, subscribedValues: { values } }">
      <component :is="form.Input" label="name" name="name" />
      <component :is="form.Input" label="age" name="age" />
      <pre>\{\{ values \}\}</pre>
    </template>
  </OmegaForm>` }}</code></pre>

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

    <h2>Using the useOmegaForm hook</h2>
    <p>
      The useOmegaForm hook is a hook that returns the form instance and the values. It's a good way to create a form in
      a functional way.
    </p>
    <pre v-highlightjs><code class="typescript">{{ `const form = useOmegaForm(schema)` }}</code></pre>
    <p>
      Now, you can use the form instance to create the form in the template.
    </p>
    <pre v-highlightjs>
<code class="vue">{{ `<OmegaForm :form="form">
    <form.Input" label="name" name="name" />
    <form.Input" label="age" name="age" />
</OmegaForm>` }}</code></pre>

    <p>you can still register to the values via the `subscribe` prop</p>
    <pre v-highlightjs>
<code class="vue">{{ `<OmegaForm :form="form" :subscribe="['values']">
    <template #externalForm="{ subscribedValues: { values } }">
      <form.Input" label="name" name="name" />
      <form.Input" label="age" name="age" />
      <pre>\{\{ values \}\}</pre>
    </template>
  </OmegaForm>` }}</code></pre>
    <p>
      <strong>Note:</strong> the template name is <code>externalForm</code>
      because the form is not inside the component, it's outside. And you don't have access to the form instance inside
      the template variables anymore.
    </p>

    <h3>Using custom inputs</h3>
    <p>
      You can use custom inputs by passing an OmegaInput a child component.
    </p>
    <pre v-highlightjs>
<code class="vue">{{ `<OmegaForm :form="form">
  <form.Input label="name" name="name">
    <template #default="{ field, label }">
      <label :for="name">\{\{ label \}\}</label>
      <input
        :id="name"
        v-model="field.state.value"
        :name="name"
        style="border: 1px solid red"
        @change="(e) => field.handleChange(e.target.value)"
      />
    </template>
  </form.Input>
</OmegaForm>` }}</code></pre>
    <OmegaForm :form="form">
      <form.Input
        label="name"
        name="name"
      >
        <template #default="{ field, label, name }">
          <label :for="name">{{ label }}</label>
          <input
            :id="name"
            v-model="field.state.value"
            :name="name"
            style="border: 1px solid red"
            @change="(e: any) => field.handleChange(e.target.value)"
          >
        </template>
      </form.Input>
    </OmegaForm>
    <h3>Known issues</h3>
    <p>
      You can't write something like this:
    </p>
    <pre v-highlightjs>
<code class="vue">{{ `<OmegaForm :schema="schema">
  <template #internalForm="{ form }">
    <form.Input label="name" name="name" />
    <form.Input label="age" name="age" />
  </template>
</OmegaForm>` }}</code></pre>
    <p>
      because When Vue's template compiler encounters <code>form.Input</code>, it try to resolve or analyze the form
      object and its Input property earlier in the rendering pipeline. Since form.Input is provided by the parent
      OmegaForm through the slot, this direct usage inside the slot might create a tighter, more immediate dependency
      loop that the compiler/renderer detects or falls into, leading to the stack overflow.
    </p>
  </div>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { OmegaForm, useOmegaForm } from "../../src/components/OmegaForm"

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
</style>

---
"@effect-app/vue-components": minor
---

- Rewrite external api to integrate `form.Input` as possible way to use `OmegaInput` and document the changes

**BREAKING CHANGE (v0.4.0):** Users upgrading from v0.3.x need to adjust their `OmegaForm` templates.

The `#default` slot has been replaced:
  - If you **do not** pass an external `form` prop to `OmegaForm`, rename the `#default` slot to `#internalForm`.
  - If you **do** pass an external `form` prop to `OmegaForm`, rename the `#default` slot to `#externalForm`.

Additionally, when using the `#externalForm` slot (passing an external `form` prop):
  - **Do not** use the `form` instance provided by the slot template variables.
  - Use your **externally created/passed** `form` instance directly within the template.

**Example Diff:**

*Before (v0.3.x):*
```vue
<template>
  <!-- Case 1: No external form prop -->
  <OmegaForm :schema="schema">
    <template #default="{ form }">
      <!-- Use form -->
    </template>
  </OmegaForm>

  <!-- Case 2: External form prop -->
  <OmegaForm :schema="schema" :form="myForm">
    <template #default="{ form }">
      <!-- Use form (implicitly myForm) -->
    </template>
  </OmegaForm>
</template>
```

*After (v0.4.0):*
```vue
<template>
  <!-- Case 1: No external form prop -->
  <OmegaForm :schema="schema">
    <template #internalForm="{ form }">
       <!-- Use form -->
    </template>
  </OmegaForm>

  <!-- Case 2: External form prop -->
  <OmegaForm :schema="schema" :form="myForm">
    <template #externalForm>
      <!-- Use myForm directly -->
    </template>
  </OmegaForm>
</template>
<script setup>
// Assuming myForm is defined here for Case 2
</script>
```



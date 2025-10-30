<template>
  <div style="max-width: 600px; margin: 0 auto">
    <h2>Custom Label Slot Examples</h2>
    <form.Form :subscribe="['values']">
      <template #default="{ subscribedValues: { values } }">
        <div style="margin-bottom: 20px">
          <h3>Standard Label (no slot)</h3>
          <form.Input
            label="Standard Email Field"
            name="standardEmail"
          />
        </div>

        <div style="margin-bottom: 20px">
          <h3>Custom HTML Label with Icon</h3>
          <form.Input name="emailWithIcon">
            <template #label="{ required }">
              <span style="display: flex; align-items: center; gap: 4px">
                <span style="font-size: 18px">📧</span>
                <span>Email Address</span>
                <span
                  v-if="required"
                  style="color: red"
                >*</span>
              </span>
            </template>
          </form.Input>
        </div>

        <div style="margin-bottom: 20px">
          <h3>Styled Required Label</h3>
          <form.Input name="styledRequired">
            <template #label="{ required, label }">
              <span style="color: #1976d2; font-weight: 600">
                {{ label }}
                <sup
                  v-if="required"
                  style="color: #d32f2f; font-size: 14px"
                >required</sup>
              </span>
            </template>
          </form.Input>
        </div>

        <div style="margin-bottom: 20px">
          <h3>Label with Tooltip Info</h3>
          <form.Input
            name="password"
            type="password"
          >
            <template #label="{ required }">
              <span style="display: flex; align-items: center; gap: 8px">
                <span>Password</span>
                <span
                  v-if="required"
                  style="color: red"
                >*</span>
                <span
                  style="background: #e3f2fd; padding: 2px 8px; border-radius: 4px; font-size: 12px; color: #1976d2"
                  title="Must be at least 8 characters"
                >ℹ️ min 8 chars</span>
              </span>
            </template>
          </form.Input>
        </div>

        <div style="margin-bottom: 20px">
          <h3>Select with Custom Badge</h3>
          <form.Input
            name="country"
            type="select"
            :options="[
              { title: 'United States', value: 'us' },
              { title: 'Canada', value: 'ca' },
              { title: 'Mexico', value: 'mx' }
            ]"
          >
            <template #label="{ required }">
              <span style="display: flex; align-items: center; gap: 8px">
                <span>Country</span>
                <span
                  v-if="required"
                  style="color: red"
                >*</span>
                <span
                  style="background: #4caf50; color: white; padding: 2px 6px; border-radius: 12px; font-size: 10px; font-weight: bold"
                >NEW</span>
              </span>
            </template>
          </form.Input>
        </div>

        <div style="margin-bottom: 20px">
          <h3>Optional Field with Custom Styling</h3>
          <form.Input name="optionalField">
            <template #label="{ required }">
              <span style="color: #666">
                Optional Notes
                <span
                  v-if="!required"
                  style="font-size: 12px; color: #999; font-style: italic"
                >(optional)</span>
              </span>
            </template>
          </form.Input>
        </div>

        <div style="margin-top: 30px; padding: 20px; background: #f5f5f5; border-radius: 8px">
          <h4 style="margin-top: 0">
            Form Values:
          </h4>
          <pre style="background: white; padding: 12px; border-radius: 4px; overflow: auto">{{ JSON.stringify(values, null, 2) }}</pre>
        </div>

        <v-btn
          type="submit"
          style="margin-top: 20px"
          color="primary"
        >
          Submit Form
        </v-btn>
      </template>
    </form.Form>
  </div>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { useOmegaForm } from "../../src/components/OmegaForm"

const schema = S.Struct({
  standardEmail: S.String,
  emailWithIcon: S.String,
  styledRequired: S.String,
  password: S.String,
  country: S.String,
  optionalField: S.optional(S.String)
})

const form = useOmegaForm(schema, {
  onSubmit: async ({ value }) => {
    console.log("Form submitted:", value)
    alert("Form submitted! Check console for values.")
  }
})
</script>

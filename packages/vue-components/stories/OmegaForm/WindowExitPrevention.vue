<template>
  <div class="pa-4">
    <h1 class="text-h4 mb-4">
      Window Exit Prevention
    </h1>
    <p class="mb-6">
      Demonstrates preventing browser window/tab exit when forms have unsaved changes.
    </p>

    <!-- Example 1: Basic Window Exit Prevention -->
    <v-card class="mb-6">
      <v-card-title>Example 1: Basic Window Exit Prevention</v-card-title>
      <v-card-text>
        <p class="mb-4">
          Edit the form below, then try to:
        </p>
        <ul class="mb-4">
          <li>Refresh the page (Ctrl+R / Cmd+R)</li>
          <li>Close the browser tab</li>
          <li>Navigate away from the page</li>
        </ul>
        <p class="mb-4 text-warning">
          ⚠️ You'll see the browser's native "Leave site?" confirmation dialog.
        </p>

        <basicForm.Form>
          <div class="mb-2">
            isDirty: <strong>{{ isDirtyBasic }}</strong>
          </div>
          <basicForm.Input
            label="Username"
            name="username"
          />
          <basicForm.Input
            label="Email"
            name="email"
          />
          <basicForm.Input
            label="Bio"
            name="bio"
          />

          <div class="mt-4">
            <v-btn
              color="primary"
              type="submit"
            >
              Save
            </v-btn>
            <v-btn
              class="ml-2"
              @click="basicForm.reset()"
            >
              Reset
            </v-btn>
          </div>
        </basicForm.Form>
      </v-card-text>
    </v-card>

    <!-- Example 2: Window Exit + Data Persistence -->
    <v-card class="mb-6">
      <v-card-title>Example 2: Window Exit + Data Persistence (Independent Features)</v-card-title>
      <v-card-text>
        <p class="mb-4">
          This form has BOTH features enabled independently:
        </p>
        <ul class="mb-4">
          <li><strong>Window Exit Prevention:</strong> Shows confirmation dialog when trying to leave</li>
          <li><strong>Data Persistence:</strong> Saves form data to localStorage on exit</li>
        </ul>
        <p class="mb-4">
          <strong>Try this:</strong> Edit the form, refresh the page (dismiss the warning), and see your data is still
          there!
        </p>

        <v-alert
          type="success"
          class="mb-4"
        >
          These features work independently. Even if you dismiss the warning and leave, your data is saved.
        </v-alert>

        <persistentForm.Form>
          <div class="mb-2">
            isDirty: <strong>{{ isDirtyPersistent }}</strong>
          </div>
          <persistentForm.Input
            label="Task Name"
            name="taskName"
          />
          <persistentForm.Input
            label="Description"
            name="description"
          />
          <persistentForm.Input
            label="Priority"
            name="priority"
            :options="[
              { value: 'low', title: 'Low' },
              { value: 'medium', title: 'Medium' },
              { value: 'high', title: 'High' }
            ]"
          />

          <div class="mt-4">
            <v-btn
              color="primary"
              type="submit"
            >
              Save
            </v-btn>
            <v-btn
              class="ml-2"
              @click="persistentForm.reset()"
            >
              Reset
            </v-btn>
            <v-btn
              class="ml-2"
              @click="persistentForm.clear()"
            >
              Clear All
            </v-btn>
          </div>
        </persistentForm.Form>

        <v-divider class="my-4" />

        <v-expansion-panels>
          <v-expansion-panel>
            <v-expansion-panel-title>
              View Configuration Code
            </v-expansion-panel-title>
            <v-expansion-panel-text>
              <pre class="pa-4 bg-grey-lighten-4"><code>const form = useOmegaForm(
  schema,
  { onSubmit: async ({ value }) => { ... } },
  {
    preventWindowExit: {
      enabled: true,
      message: "You have unsaved changes!"
    },
    persistency: {
      policies: ["local"],
      overrideDefaultValues: true
    }
  }
)</code></pre>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
      </v-card-text>
    </v-card>

    <!-- Example 3: Disabled Prevention -->
    <v-card>
      <v-card-title>Example 3: Without Prevention (Default Behavior)</v-card-title>
      <v-card-text>
        <p class="mb-4">
          This form has window exit prevention <strong>disabled</strong> (the default). You can refresh or close the tab
          freely, even with unsaved changes.
        </p>

        <v-alert
          type="info"
          class="mb-4"
        >
          Window exit prevention is opt-in only. Forms without the config can be exited freely.
        </v-alert>

        <preventAndReset.Form>
          <div class="mb-2">
            isDirty: <strong>{{ isDirtyNoPrevention }}</strong>
          </div>
          <preventAndReset.Input
            label="Comment"
            name="comment"
          />
          <preventAndReset.Input
            label="Rating"
            name="rating"
            type="number"
          />

          <div class="mt-4">
            <v-btn
              color="primary"
              type="submit"
            >
              Submit
            </v-btn>
            <v-btn
              class="ml-2"
              @click="preventAndReset.reset()"
            >
              Reset
            </v-btn>
          </div>
        </preventAndReset.Form>

        <p class="mt-4 text-caption">
          Try refreshing the page - no warning will appear even if the form is dirty.
        </p>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { useOmegaForm } from "../../src/components/OmegaForm/useOmegaForm"

// Example 1: Basic window exit prevention
const basicForm = useOmegaForm(
  S.Struct({
    username: S.String,
    email: S.String,
    bio: S.String
  }),
  {
    defaultValues: { username: "", email: "", bio: "" },
    onSubmit: async ({ value }) => {
      console.log("Basic form submitted:", value)
      // Simulate save
      await new Promise((resolve) => setTimeout(resolve, 500))
      alert("Saved! Form is now clean, you can refresh without warning.")
    }
  },
  {
    preventWindowExit: "prevent"
  }
)
const isDirtyBasic = basicForm.useStore((_) => _.isDirty)

// Example 2: Window exit prevention + data persistence
const persistentForm = useOmegaForm(
  S.Struct({
    taskName: S.String,
    description: S.String,
    priority: S.Union(S.Literal("low"), S.Literal("medium"), S.Literal("high"))
  }),
  {
    defaultValues: { taskName: "", description: "", priority: "medium" as const },
    onSubmit: async ({ value }) => {
      console.log("Persistent form submitted:", value)
      await new Promise((resolve) => setTimeout(resolve, 500))
      alert("Saved!")
    }
  },
  {
    preventWindowExit: "prevent",
    persistency: {
      policies: ["local"],
      overrideDefaultValues: true
    }
  }
)
const isDirtyPersistent = persistentForm.useStore((_) => _.isDirty)

// Example 3: No prevention (default behavior)
const preventAndReset = useOmegaForm(
  S.Struct({
    comment: S.String,
    rating: S.Number
  }),
  {
    defaultValues: { comment: "", rating: 5 },
    onSubmit: async ({ value }) => {
      console.log("No prevention form submitted:", value)
      await new Promise((resolve) => setTimeout(resolve, 500))
      alert("Submitted!")
    }
  },
  {
    preventWindowExit: "prevent-and-reset"
  }
)
const isDirtyNoPrevention = preventAndReset.useStore((_) => _.isDirty)
</script>

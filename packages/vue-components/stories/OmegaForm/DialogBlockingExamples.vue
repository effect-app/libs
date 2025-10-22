<template>
  <div class="pa-4">
    <h1 class="text-h4 mb-4">
      Dialog Exit Blocking
    </h1>
    <p class="mb-6">
      Forms automatically prevent dialog closing when dirty. Try editing and pressing Escape or clicking outside.
    </p>

    <v-card>
      <v-card-text>
        <p class="mb-4">
          Edit the form and try to close. You'll see: "Es sind ungespeicherte Änderungen vorhanden. Wirklich schließen?"
        </p>
        <v-btn @click="open = true">
          Open Dialog
        </v-btn>

        <Dialog v-model="open">
          <template #default="{ cancel }">
            <v-card max-width="600">
              <v-card-title class="d-flex justify-space-between align-center">
                Edit User
                <v-btn
                  icon="mdi-close"
                  variant="text"
                  size="small"
                  @click="cancel"
                />
              </v-card-title>
              <v-card-text>
                <form.Form>
                  <form.Input
                    label="Name"
                    name="name"
                  />
                  <form.Input
                    label="Email"
                    name="email"
                  />
                </form.Form>
              </v-card-text>
              <v-card-actions>
                <v-btn
                  variant="text"
                  @click="cancel"
                >
                  Cancel
                </v-btn>
              </v-card-actions>
            </v-card>
          </template>
        </Dialog>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { ref } from "vue"
import Dialog from "../../src/components/Dialog.vue"
import { provideBus } from "../../src/components/OmegaForm/blockDialog"
import { useOmegaForm } from "../../src/components/OmegaForm/useOmegaForm"

provideBus()

const open = ref(false)
const form = useOmegaForm(
  S.Struct({ name: S.String, email: S.String }),
  { defaultValues: { name: "", email: "" } }
)
</script>

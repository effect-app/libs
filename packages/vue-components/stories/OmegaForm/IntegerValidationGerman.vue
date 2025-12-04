<template>
  <div style="max-width: 600px; margin: 0 auto; padding: 20px">
    <h2>Integer Validation - German Translation Test</h2>
    <p>Testen Sie die Validierung mit deutschen Fehlermeldungen:</p>
    <ul>
      <li>Geben Sie <code>59.5</code> in "länge" ein → Fehler sollte in Deutsch erscheinen</li>
      <li>Geben Sie <code>15.7</code> in "breite" ein → Fehler sollte in Deutsch erscheinen</li>
      <li>Geben Sie <code>59</code> ein → Sollte akzeptiert werden ✓</li>
    </ul>

    <form.Form :subscribe="['values', 'errors']">
      <template #default="{ subscribedValues: { values, errors } }">
        <div style="margin-bottom: 20px">
          <form.Input
            name="lange"
            label="länge (cm)"
            placeholder="z.B. 59"
          />
        </div>

        <div style="margin-bottom: 20px">
          <form.Input
            name="breite"
            label="breite (cm)"
            placeholder="z.B. 15"
          />
        </div>

        <div style="margin-bottom: 20px">
          <form.Input
            name="hohe"
            label="höhe (cm)"
            placeholder="z.B. 9"
          />
        </div>

        <div style="margin-bottom: 20px">
          <form.Input
            name="gewicht"
            label="gewicht (kg)"
            placeholder="z.B. 10"
          />
        </div>

        <v-btn
          type="submit"
          color="primary"
        >
          Packen
        </v-btn>

        <div style="margin-top: 20px; padding: 10px; background: #f5f5f5; border-radius: 4px">
          <strong>Aktuelle Werte:</strong>
          <pre>{{ JSON.stringify(values, null, 2) }}</pre>
        </div>

        <div
          v-if="errors && Object.keys(errors).length > 0"
          style="margin-top: 20px; padding: 10px; background: #ffebee; border-radius: 4px; border-left: 4px solid #f44336"
        >
          <strong>Fehler:</strong>
          <pre>{{ JSON.stringify(errors, null, 2) }}</pre>
        </div>

        <form.Errors />
      </template>
    </form.Form>
  </div>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { useOmegaForm } from "../../src/components/OmegaForm"

// schema con campi integer per testare la validazione
const PackageSchema = S.Struct({
  lange: S.Int, // lunghezza in cm
  breite: S.Int, // larghezza in cm
  hohe: S.Int, // altezza in cm
  gewicht: S.Int // peso in kg
})

const form = useOmegaForm(PackageSchema, {
  onSubmit: ({ value }) => {
    console.log("Form submitted with values:", value)
    alert(`Packen erfolgreich!\n${JSON.stringify(value, null, 2)}`)
    return undefined as any
  }
})
</script>

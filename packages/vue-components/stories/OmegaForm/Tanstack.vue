<template>
  <form @submit="form.handleSubmit">
    <div>
      <label for="age">Age</label>
      <form.Field id="age" name="age" type="number">
        <template #default="{ field }">
          <div class="field">
            <input
              :value="field.state.value"
              type="number"
              @input="
                e =>
                  field.handleChange(
                    Number((e.target as HTMLInputElement).value),
                  )
              "
            />
            <em v-if="field.state.meta.errors.length > 0" role="alert">
              {{ field.state.meta.errors.map(e => e?.message).join(", ") }}
            </em>
          </div>
        </template>
      </form.Field>
      <label for="email">Email</label>
      <form.Field id="email" name="email" type="text">
        <template #default="{ field }">
          <div class="field">
            <input
              :value="field.state.value"
              @input="
                e => field.handleChange((e.target as HTMLInputElement).value)
              "
            />
            <em v-if="field.state.meta.errors.length > 0" role="alert">
              {{ field.state.meta.errors.map(e => e?.message).join(", ") }}
            </em>
          </div>
        </template>
      </form.Field>
    </div>
    <div>
      <pre>{{ errors }}</pre>
    </div>
  </form>
</template>

<script setup lang="ts">
import { useForm } from "@tanstack/vue-form"
import { S } from "effect-app"

const schema = S.Struct({
  age: S.Number.pipe(S.lessThan(2)),
  email: S.Email,
})

const defaultSchema = S.standardSchemaV1(schema)

const form = useForm({
  defaultValues: {
    age: 0,
    email: "test@test.com",
  },
  onSubmit: async ({ value }) => {
    console.log(value)
  },
  validators: {
    onChange: defaultSchema,
  },
})

const errors = form.useStore(v => v.errors)
</script>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
label {
  display: block;
  font-size: 0.8rem;
}
input {
  border: 1px solid #ccc;
  border-radius: 0.25rem;
  padding: 0.5rem;
}

em[role="alert"] {
  color: red;
  font-size: 0.8rem;
}
</style>

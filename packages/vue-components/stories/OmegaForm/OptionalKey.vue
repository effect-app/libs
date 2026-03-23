<template>
  <div class="container">
    <h2>OptionalKey with decodingDefault</h2>
    <p>
      <code>S.optionalKey(X).pipe(S.withDecodingDefault(...))</code> marks a field as optional and provides a default
      value during decoding. This is the v4 replacement for <code>S.optionalWith(X, { default: ... })</code>.
    </p>

    <h3>Basic optionalKey with decodingDefault</h3>
    <pre v-highlightjs>
<code class="typescript">{{ basicCode }}</code></pre>

    <basic.Form :subscribe="['values']">
      <template #default="{ subscribedValues: { values: vvv } }">
        <div>Values: <br> {{ vvv }}</div>
        <basic.Input name="name" />
        <basic.Input name="age" />
        <basic.Input name="active" />
        <basic.Input name="required" />
        <v-btn type="submit">
          Submit
        </v-btn>
      </template>
    </basic.Form>

    <h3>Mixed withDefaultConstructor and optionalKey</h3>
    <pre v-highlightjs>
<code class="typescript">{{ mixedCode }}</code></pre>

    <mixed.Form :subscribe="['values']">
      <template #default="{ subscribedValues: { values: vvv } }">
        <div>Values: <br> {{ vvv }}</div>
        <mixed.Input name="fromDecoding" />
        <mixed.Input name="fromConstructor" />
        <mixed.Input name="plain" />
        <v-btn type="submit">
          Submit
        </v-btn>
      </template>
    </mixed.Form>

    <h3>optionalKey with nested struct</h3>
    <pre v-highlightjs>
<code class="typescript">{{ nestedCode }}</code></pre>

    <nested.Form :subscribe="['values']">
      <template #default="{ subscribedValues: { values: vvv } }">
        <div>Values: <br> {{ vvv }}</div>
        <nested.Input name="title" />
        <nested.Input name="address.street" />
        <nested.Input name="address.city" />
        <v-btn type="submit">
          Submit
        </v-btn>
      </template>
    </nested.Form>
  </div>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { useOmegaForm } from "../../src/components/OmegaForm"

const basicCode = `const form = useOmegaForm(
  S.Struct({
    name: S.optionalKey(S.String).pipe(S.withDecodingDefault(() => "John")),
    age: S.optionalKey(S.Number).pipe(S.withDecodingDefault(() => 25)),
    active: S.optionalKey(S.Boolean).pipe(S.withDecodingDefault(() => true)),
    required: S.NonEmptyString255
  })
)`

const mixedCode = `const form = useOmegaForm(
  S.Struct({
    fromDecoding: S.optionalKey(S.String).pipe(S.withDecodingDefault(() => "decodingValue")),
    fromConstructor: S.String.pipe(S.withDefaultConstructor(() => "constructorValue")),
    plain: S.Boolean
  })
)`

const nestedCode = `const form = useOmegaForm(
  S.Struct({
    title: S.optionalKey(S.NonEmptyString255).pipe(
      S.withDecodingDefault(() => S.NonEmptyString255("Default Title"))
    ),
    address: S.Struct({
      street: S.optionalKey(S.String).pipe(S.withDecodingDefault(() => "123 Main St")),
      city: S.optionalKey(S.String).pipe(S.withDecodingDefault(() => "Springfield"))
    })
  })
)`

const basic = useOmegaForm(
  S.Struct({
    name: S.optionalKey(S.String).pipe(S.withDecodingDefault(() => "John")),
    age: S.optionalKey(S.Number).pipe(S.withDecodingDefault(() => 25)),
    active: S.optionalKey(S.Boolean).pipe(S.withDecodingDefault(() => true)),
    required: S.NonEmptyString255
  })
)

const mixed = useOmegaForm(
  S.Struct({
    fromDecoding: S.optionalKey(S.String).pipe(S.withDecodingDefault(() => "decodingValue")),
    fromConstructor: S.String.pipe(S.withDefaultConstructor(() => "constructorValue")),
    plain: S.Boolean
  })
)

const nested = useOmegaForm(
  S.Struct({
    title: S.optionalKey(S.NonEmptyString255).pipe(S.withDecodingDefault(() => S.NonEmptyString255("Default Title"))),
    address: S.Struct({
      street: S.optionalKey(S.String).pipe(S.withDecodingDefault(() => "123 Main St")),
      city: S.optionalKey(S.String).pipe(S.withDecodingDefault(() => "Springfield"))
    })
  })
)
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

h2, h3 {
  text-wrap: balance;
}
</style>

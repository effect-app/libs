# Resource Clients

We use Resource Clients to access Resources on the api.
Internally it uses Effect RPC.

## Query

Queries are for reading data from the api. No writing/mutating allowed. Queries by default are deduplicated, shared between components, auto refreshed after stale time and user interaction with the tab/window.

## Mutation

Mutations are for writing data to the api, return values should at most include identifiers, and often `void`.
Mutations auto invalidate Queries in their namespace, so that a Users.Index Query will be invalidated upon a Users.Delete or Update mutation.
This only occurs within the same namespace, like "Users".
If you need to invalidate queries in another namespace, you can pass the following option to the Mutation constructor: 

```ts
  queryInvalidation: (queryKey) => [
    { filters: { queryKey } },
    { filters: { queryKey: makeQueryKey(meClient.GetMe) } }
  ]
```

## Command

A Command captures the start of a user interaction (e.g button click), procceses the input, performs side effects,
all of this wrapped in a tracing span and defect reporting. To handle status updated to the UI, Commands return Results, and you can compose various handling like automatic Toast on Wait, Succeed and Failure.
All queries and mutations have a strict namespace and name, which is then used for span names, i18n, etc.

### I18n

Commands require an Identifier, it can either be manually specified, or derived from a provided Mutation.
The base intl key for each command is `action.${Command.id}`, e.g: `action.HelloWorld.SetState`.
Each Command has a reactive `action` property, which is a formatted message based on the base intl key, and the computed `state` provided when creating the Command.
The `action` property can be used as button labels or titles, and will be used by the `Command.withDefaultToast()` implementation unless overriden.
Each Toast stage can be further customised by adding messages with namespaced i18n keys for: `waiting`, `failure` and `success`
e.g: `action.HelloWorld.SetState.waiting`.
Various default copy lives in [DefaultIntl](../../../packages/vue/src/experimental/commander.ts)

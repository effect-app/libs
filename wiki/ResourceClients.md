# Resource Clients

We use Resource Clients to access Resources on the api.
Internally it uses Effect RPC.

## Query

Queries are for reading data from the api. No writing/mutating allowed. Queries by default are deduplicated, shared between components, auto refreshed after stale time and user interaction with the tab/window.

## Mutation

Mutations are for writing data to the api, return values should at most include identifiers, and often `void`.
Query invalidation is driven by server-provided invalidation keys or by explicit configuration — there is no automatic namespace invalidation.

### Option 1 — Request-level configuration (preferred)

Attach an `invalidatesQueries` callback directly to the Command class definition. This is co-located with the request schema and applies automatically whenever the command is used via `clientFor`:

```ts
type Resources = { Users: { GetUser: typeof Users.GetUser; ListUsers: typeof Users.ListUsers } }

class DeleteUser extends UsersReq.Command<DeleteUser, Resources>()(
  "DeleteUser",
  { id: S.String },
  {},
  (queryKey, { Users }, input) => [
    { filters: { queryKey: makeQueryKey(Users.GetUser) } },
    { filters: { queryKey: makeQueryKey(Users.ListUsers) } }
  ]
) {}
```

The `invalidationResources` must be passed to `clientFor` so the callback receives the actual query handlers:

```ts
const client = clientFor(Users, undefined, {
  Users: {
    GetUser: Users.GetUser,
    ListUsers: Users.ListUsers
  }
})
```

### Option 2 — `clientFor` factory-level configuration

Pass a `queryInvalidation` factory as the second argument to `clientFor` to configure invalidation for one or more commands at the client-construction site:

```ts
const client = clientFor(
  Users,
  (client) => ({
    DeleteUser: (queryKey) => [
      { filters: { queryKey } },
      { filters: { queryKey: makeQueryKey(client.ListUsers) } }
    ]
  })
)
```

### Option 3 — per-call override

Override at the call site via `queryInvalidation`. Merges with any factory-level or request-level configuration:

```ts
deleteUserMutation(input, {
  queryInvalidation: (queryKey) => [
    { filters: { queryKey } },
    { filters: { queryKey: makeQueryKey(meClient.GetMe) } }
  ]
})
```

### Option 4 — server-driven invalidation

The server handler can push invalidation keys via `InvalidationKeysFromServer` without any client-side configuration.

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
Various default copy lives in [DefaultIntl](../../../packages/vue/src/commander.ts)

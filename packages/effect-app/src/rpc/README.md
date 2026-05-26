# Effect RPC extensions

The extensions use V4 format of RPC middleware:

- supports `requires` besides `provides`
- `requires` and `provides` should be set as second generic argument: `Tag<Self, Config>`.
- `wrap: true` is the default, there is no classic `provides: Tag`

## Features

### Bundle Middleware

Compose multiple middleware into a single middleware, so that you can use them easily together as a unit.
The middleware group is fully typesafe, supporting chained or sideways elimination of requirements.
All configured dynamic middleware must be provided or the bundle is not complete.

### Dynamic Middleware

Dynamic middleware is middleware that is being controlled by Configuration set on the RPC.
The middleware generally runs globally, but it's behaviour depends on configuration on the RPC.

For instance, `AllowAnonymous`, with a default of `false`, would either provide a `UserProfile` service, or fail with a `NotLoggedInError`.
therefore `UserProfile` is eliminated from a handler implementing that rpc.
If the RPC however opts out and specifies: `allowAnonymous: true`, the `UserProfile` service is no longer eliminated from the handler,
and thus one has to use `Effect.serviceOption(UserProfile)` instead, to not get a type error.

For instance, `RequireRoles` would by default require a `manager` role, but can be opted out from per RPC, perhaps lowering to `user` or `anonymous` role.

### Create RPCGroups and Handlers from a common set of Middleware

You create a bundle of middleware, containing standard or dynamic middleware, and from it you can create all your rpc groups and handlers.
NOTE: perhaps not as useful anymore if support for dynamic middleware gets integrated directly into effect RPC.
`middleware.group`, `middleware.rpc` and `group.toLayerDynamic` would become obsolete, and `RpcGroup.make().middleware(globalMiddleware)` would be simpler.

## Controller pattern vs Standard RPC

The codebase supports two distinct server-definition styles that share the same
dynamic-middleware infrastructure.

### Standard RPC (preferred for new code)

Uses Effect's built-in `effect/unstable/rpc` API directly.

```ts
// Define
const GetUser = AppMiddleware.rpc("GetUser", {
  payload: { id: S.String },
  success: UserSchema,
  config: { allowAnonymous: false }
})

// Group + attach middleware
const UserRpcs = MiddlewareMaker.middlewareGroup(AppMiddleware)(
  RpcGroup.make(GetUser, ...)
)

// Implement
const impl = UserRpcs.toLayerDynamic({
  GetUser: Effect.fn(function*({ id }) { ... })
})

// Client
const client = yield* RpcClient.makeWith(UserRpcs, ...)
```

Key properties:
- Wire codec: Effect RPC serialization (JSON via `RpcSerialization`)
- Transport: pluggable (HTTP, WebSocket, in-process via `RpcTest.makeClient`)
- Streaming: `stream: true` option produces `RpcSchema.Stream<Success, Error>`
- Commands: `command: true` wraps success/error with `CommandResponseWithMetaData` / `CommandFailureWithMetaData` and accumulates `InvalidationSet` keys
- Type-safe handler requirements via `toLayerDynamic` + `HandlersContext`

### Controller pattern (legacy, still used by `makeClient` / `clientFor`)

Uses custom request classes built by `makeClient.ts`.

```ts
// Define (in a "resource" / "Rsc" module)
export class GetUser extends TaggedClass<GetUser>()("GetUser", {
  id: S.String
}, { success: UserSchema, moduleName: "Users", type: "query" }) {}

// Server: controller implementing the request tag
// Client: clientFor / makeClient returns typed handler functions
const client = makeClient(AppMiddleware)(AllRequests)
const user = yield* client.GetUser({ id: "123" })
```

Key differences from standard RPC:

| Aspect | Standard RPC | Controller |
|---|---|---|
| Wire format | Effect RPC codec | Custom HTTP + JSON |
| Transport | Pluggable | HTTP only (`apiClientFactory`) |
| Client | `RpcClient.makeWith` | `clientFor` / `makeClient` |
| Streaming | `stream: true` via `RpcSchema.Stream` | `stream: true` + optional `final` schema |
| Commands | `command: true` + `commandHandler` | `type: "command"` on request class |
| Invalidation | `InvalidationSet` in handler | `Invalidates` annotation on request class |
| Testing | `RpcTest.makeClient` (in-process) | Requires HTTP layer |
| `final` schema | Not applicable | Declared but **not yet implemented** at runtime |

The controller pattern predates Effect's native RPC middleware support.
Prefer the standard RPC approach for new modules.

## Examples

See [tests](../../../infra/test/rpc-multi-middleware.test.ts)

## Future

Gauge interest to integrate natively into `@effect/rpc` package, and then integrate.

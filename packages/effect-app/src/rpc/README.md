# Effect RPC extensions

The extensions use V4 format of RPC middleware:

- supports `requires` besides `provides`
- `requires` and `provides`  should be set as second generic argument: `Tag<Self, Config>`.
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
If the RPC however opts out and species: `allowAnonymous: true`, the `UserProfile` service is no longer eliminated from the handler,
and thus one has to use `Effect.serviceOption(UserProfile)` instead, to not get a type error.

For instance, `RequireRoles` would by default require a `manager` role, but can be opted out from per RPC, perhaps lowering to `user` or `anonymous` role.ks

### Create RPCGroups and Handlers from a common set of Middleware

You create a bundle of middleware, containing standard or dynamic middleware, and from it you can create all your rpc groups and handlers.
NOTE: perhaps not as useful anymore if support for dynamic middleware gets integrated directly into effect RPC.
`middleware.group`, `middleware.rpc` and `group.toLayerDynamic` would become obsolete, and `RpcGroup.make().middleware(globalMiddleware)` would be simpler.

## Examples

See  [tests](../../../infra/test/rpc-multi-middleware.test.ts)

## Future

Gauge interest to integrate natively into `@effect/rpc` package, and then integrate.

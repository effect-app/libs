import { type MakeContext, type MakeErrors, makeRouter } from "@effect-app/infra/api/routing"
import { makeAllDSL, makeOneDSL } from "@effect-app/infra/Model"
import { expectTypeOf, it } from "@effect/vitest"
import { Context, Effect, Layer, RpcX, S } from "effect-app"
import { InvalidStateError, makeRpcClient, UnauthorizedError } from "effect-app/client"
import { DefaultGenericMiddlewares } from "effect-app/middleware"
import { type FixEnv } from "effect-app/Pure"
import { MiddlewareMaker } from "effect-app/rpc"
import { type TypeTestId } from "effect-app/TypeTest"
import { type ConfigError } from "effect/Config"
import { type RpcSerialization } from "effect/unstable/rpc/RpcSerialization"
import { DefaultGenericMiddlewaresLive, DevModeMiddlewareLive } from "../src/api/routing/middleware.js"
import { AllowAnonymous, AllowAnonymousLive, RequestContextMap, RequireRoles, RequireRolesLive, Some, SomeElse, SomeService, Test, TestLive } from "./fixtures.js"

// Inline minimal context provider (provides `Some`)
class CtxProvider extends RpcX.RpcMiddleware.Tag<CtxProvider, { provides: Some }>()("CtxProvider") {
  static Default = Layer.make(this, {
    *make() {
      return Effect.fnUntraced(function*(effect) {
        return yield* Effect.provideService(effect, Some, Some.of({ a: 1 }))
      })
    }
  })
}

// Provides `SomeElse` so AllowAnonymous's requirement is met.
class SomeElseProvider extends RpcX.RpcMiddleware.Tag<SomeElseProvider, { provides: SomeElse }>()("SomeElseProvider") {
  static Default = Layer.make(this, {
    *make() {
      return Effect.fnUntraced(function*(effect) {
        return yield* Effect.provideService(effect, SomeElse, SomeElse.of({ b: 2 }))
      })
    }
  })
}

class mw extends MiddlewareMaker
  .Tag<mw>()("mw", RequestContextMap)
  .middleware(RequireRoles, Test)
  .middleware(AllowAnonymous)
  .middleware(CtxProvider)
  .middleware(...DefaultGenericMiddlewares, SomeElseProvider)
{
  static Default = this.layer.pipe(
    Layer.provide([
      RequireRolesLive,
      TestLive,
      AllowAnonymousLive,
      CtxProvider.Default,
      SomeElseProvider.Default,
      DefaultGenericMiddlewaresLive,
      DevModeMiddlewareLive,
      SomeService.Default
    ])
  )
}

const { TaggedRequestFor } = makeRpcClient(RequestContextMap)
const Req = TaggedRequestFor("GenRouter")

class GetThing extends Req.Query<GetThing>()("GetThing", { id: S.String }, { success: S.String }) {}
class DoThing extends Req.Command<DoThing>()("DoThing", { id: S.String }, { success: S.Void }) {}

const Resource = { GetThing, DoThing }

const { Router, matchAll } = makeRouter(mw)

class ThingRepo extends Context.Service<ThingRepo>()("ThingRepo", {
  make: Effect.succeed({ get: (id: string) => Effect.succeed(id + "!") })
}) {
  static Default = Layer.effect(this, this.make)
}

// Case under test:
// `match({})` is given handlers as **shorthand generator methods** (`*GetThing(req) { ... }`).
// tsgo (>= 7 dev) infers `TNext = unknown` for these shorthand generators while TS6 infers `never`.
// `HandlerWithInputGen` in routing.ts must accept both — see the structural fix.
const router = Router(Resource)({
  dependencies: [ThingRepo.Default],
  *effect(match) {
    const repo = yield* ThingRepo

    if (Math.random() > 0.5) return yield* new InvalidStateError("nope")

    return match({
      *GetThing(req) {
        const some = yield* Some
        if (req.id === "boom") {
          return yield* Effect.fail(new UnauthorizedError())
        }
        return yield* repo.get(req.id + String(some.a))
      },
      *DoThing(_req) {
        yield* Effect.succeed(1)
      }
    })
  }
})

// Same scenario but using the `raw:` variant — exercises the `raw` path of `HandlerWithInputGen`.
const routerRaw = Router({ GetThing })({
  *effect(match) {
    return match({
      GetThing: {
        *raw(req) {
          const some = yield* Some
          return yield* Effect.succeed(req.id + String(some.a))
        }
      }
    })
  }
})

it("router with generator-method handlers compiles", () => {
  expectTypeOf(router).toMatchTypeOf<
    Layer.Layer<never, ConfigError | InvalidStateError, SomeService | RpcSerialization>
  >()
  expectTypeOf(routerRaw).toMatchTypeOf<Layer.Layer<never, ConfigError, SomeService | RpcSerialization>>()
})

// Type-level assertions: verify generator yields propagate to MakeErrors / MakeContext
type Errors = MakeErrors<typeof router[TypeTestId]>
type Ctx = MakeContext<typeof router[TypeTestId]>
expectTypeOf<Errors>().toEqualTypeOf<InvalidStateError>()
expectTypeOf<Ctx>().toEqualTypeOf<ThingRepo>()

const matched = matchAll({ router })
expectTypeOf(matched).toMatchTypeOf<
  Layer.Layer<never, ConfigError | InvalidStateError, SomeService | RpcSerialization>
>()

// ---------------------------------------------------------------------------
// DSL R-inference regression
// ---------------------------------------------------------------------------
// `OneDSL`/`OneDSLExt.update`/`.modify` previously annotated the callback's
// effect R as `FixEnv<R, Evt, S1, S2>`. That deadlocked inference of `R`
// (TS6 → `never`, tsgo → `unknown`), causing yielded effects to leak
// `unknown` in the R slot when consumed by generator handlers.
// The fix uses bare `R` in the callback and `FixEnv<R, …>` only on the return.
class Item extends S.Class<Item>("Item")({ id: S.String, label: S.String }) {}
class Dep extends Context.Service<Dep>()("Dep", { make: Effect.succeed({ tag: "dep" as const }) }) {}

type Evt = { _tag: "Updated"; id: string }

const Items$ = makeAllDSL<Item, Evt>()
const Item$ = makeOneDSL<Item, Evt>()

// Callback body uses generator syntax (TNext = unknown under tsgo) and yields
// a service-dependent effect — R must be inferred as `Dep` (plus the
// canonical PureEnvEnv contributed by FixEnv on the return).
const oneUpdate = Item$.update((item) =>
  Effect.gen(function*() {
    const dep = yield* Dep
    return new Item({ id: item.id, label: item.label + dep.tag })
  })
)

const allUpdate = Items$.update((items) =>
  Effect.gen(function*() {
    const dep = yield* Dep
    return items.map((_) => new Item({ id: _.id, label: _.label + dep.tag }))
  })
)

const oneModify = Item$.modify((item, _dsl) =>
  Effect.gen(function*() {
    const dep = yield* Dep
    return { ...item, tag: dep.tag }
  })
)

// `R` should be `FixEnv<Dep, Evt, …>` — never collapsed to `unknown`/`never`.
// The regression manifested as `unknown` here, breaking `Dep` assignability.
expectTypeOf(oneUpdate).toMatchTypeOf<Effect.Effect<Item, never, FixEnv<Dep, Evt, Item, Item>>>()
expectTypeOf(allUpdate).toMatchTypeOf<
  Effect.Effect<readonly Item[], never, FixEnv<Dep, Evt, readonly Item[], readonly Item[]>>
>()
expectTypeOf(oneModify).toMatchTypeOf<
  Effect.Effect<{ tag: "dep"; id: string; label: string }, never, FixEnv<Dep, Evt, Item, Item>>
>()

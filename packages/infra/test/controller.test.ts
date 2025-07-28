/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { type MakeContext, type MakeErrors, makeMiddleware, makeRouter } from "@effect-app/infra/api/routing"
import type { RequestContext } from "@effect-app/infra/RequestContext"
import { expectTypeOf } from "@effect/vitest"
import { Context, Effect, Layer, type Request, S } from "effect-app"
import { type GetEffectContext, InvalidStateError, makeRpcClient, type RPCContextMap, UnauthorizedError } from "effect-app/client"
import { type HttpServerRequest } from "effect-app/http"
import { Class, TaggedError } from "effect-app/Schema"
import type * as EffectRequest from "effect/Request"
import { SomeService } from "./query.test.js"

class UserProfile extends Context.assignTag<UserProfile, UserProfile>("UserProfile")(
  Class<UserProfile>()({
    id: S.String
  })
) {
}

class NotLoggedInError extends TaggedError<NotLoggedInError>()("NotLoggedInError", {
  message: S.String
}) {}

export interface CTX {
  context: RequestContext
}

export class Some extends Context.TagMakeId("Some", Effect.succeed({ a: 1 }))<Some>() {}

// @effect-diagnostics-next-line missingEffectServiceDependency:off
export class ContextMaker extends Effect.Service<ContextMaker>()("ContextMaker", {
  effect: Effect.gen(function*() {
    yield* SomeService
    return Effect.sync(() => Context.make(Some, new Some({ a: 1 })))
  })
}) {}

export type CTXMap = {
  allowAnonymous: RPCContextMap.Inverted<"userProfile", UserProfile, typeof NotLoggedInError>
  // TODO: not boolean but `string[]`
  requireRoles: RPCContextMap.Custom<"", never, typeof UnauthorizedError, Array<string>>
}
const middleware = makeMiddleware({
  contextMap: null as unknown as CTXMap,
  // helper to deal with nested generic lmitations
  context: null as any as HttpServerRequest.HttpServerRequest,
  contextProvider: ContextMaker,
  execute: Effect.gen(function*() {
    return <T extends { config?: { [K in keyof CTXMap]?: any } }, Req extends S.TaggedRequest.All, HandlerR>(
      _schema: T & S.Schema<Req, any, never>,
      handler: (
        request: Req,
        headers: any
      ) => Effect.Effect<EffectRequest.Request.Success<Req>, EffectRequest.Request.Error<Req>, HandlerR>,
      moduleName?: string
    ) =>
    (
      req: Req,
      headers: any
    ): Effect.Effect<
      Request.Request.Success<Req>,
      Request.Request.Error<Req>,
      | HttpServerRequest.HttpServerRequest
      | Exclude<HandlerR, GetEffectContext<CTXMap, T["config"]>>
    > =>
      Effect
        .gen(function*() {
          // const headers = yield* Rpc.currentHeaders
          const ctx = Context.empty().pipe(
            Context.add(UserProfile, { id: "whatever" })
          )

          // const config = "config" in schema ? schema.config : undefined

          // Check JWT
          // TODO
          // if (!fakeLogin && !request.allowAnonymous) {
          //   yield* Effect.catchAll(
          //     checkJWTI({
          //       ...authConfig,
          //       issuer: authConfig.issuer + "/",
          //       jwksUri: `${authConfig.issuer}/.well-known/jwks.json`
          //     }),
          //     (err) => Effect.fail(new JWTError({ error: err }))
          //   )
          // }

          // const fakeLogin = true
          // const r = (fakeLogin
          //   ? makeUserProfileFromUserHeader(headers["x-user"])
          //   : makeUserProfileFromAuthorizationHeader(
          //     headers["authorization"]
          //   ))
          //   .pipe(Effect.exit, basicRuntime.runSync)
          // if (!Exit.isSuccess(r)) {
          //   yield* Effect.logWarning("Parsing userInfo failed").pipe(Effect.annotateLogs("r", r))
          // }
          // const userProfile = Option.fromNullable(Exit.isSuccess(r) ? r.value : undefined)
          // if (Option.isSome(userProfile)) {
          //   // yield* rcc.update((_) => ({ ..._, userPorfile: userProfile.value }))
          //   ctx = ctx.pipe(Context.add(UserProfile, userProfile.value))
          // } else if (!config?.allowAnonymous) {
          //   return yield* new NotLoggedInError({ message: "no auth" })
          // }

          // if (config?.requireRoles) {
          //   // TODO
          //   if (
          //     !userProfile.value
          //     || !config.requireRoles.every((role: any) => userProfile.value!.roles.includes(role))
          //   ) {
          //     return yield* new UnauthorizedError()
          //   }
          // }

          return yield* handler(req, headers).pipe(
            Effect.provide(ctx as Context.Context<GetEffectContext<CTXMap, T["config"]>>),
            Effect.provideService(Some, new Some({ a: 1 }))
          )
        })
        .pipe(
          Effect.provide(
            Effect
              .gen(function*() {
                yield* Effect.annotateCurrentSpan("request.name", moduleName ? `${moduleName}.${req._tag}` : req._tag)
                // yield* RequestContextContainer.update((_) => ({
                //   ..._,
                //   name: NonEmptyString255(moduleName ? `${moduleName}.${req._tag}` : req._tag)
                // }))
                // const httpReq = yield* HttpServerRequest.HttpServerRequest
                // TODO: only pass Authentication etc, or move headers to actual Rpc Headers
                // yield* FiberRef.update(
                //   Rpc.currentHeaders,
                //   (headers) =>
                //     HttpHeaders.merge(
                //       httpReq.headers,
                //       headers
                //     )
                // )
              })
              .pipe(Layer.effectDiscard)
          )
        )
    // .pipe(Effect.provide(RequestCacheLayers)) as any
  })
})

export type RequestConfig = {
  /** Disable authentication requirement */
  allowAnonymous?: true
  /** Control the roles that are required to access the resource */
  allowRoles?: readonly string[]
}
export const { TaggedRequest: Req } = makeRpcClient<RequestConfig, CTXMap>({
  allowAnonymous: NotLoggedInError,
  requireRoles: UnauthorizedError
})

export class Eff extends Req<Eff>()("Eff", {}, { success: S.Void }) {}
export class Gen extends Req<Gen>()("Gen", {}, { success: S.Void }) {}

export class DoSomething extends Req<DoSomething>()("DoSomething", {
  id: S.String
}, { success: S.Void }) {}

export class GetSomething extends Req<GetSomething>()("GetSomething", {
  id: S.String
}, { success: S.String }) {}

export class GetSomething2 extends Req<GetSomething2>()("GetSomething2", {
  id: S.String
}, { success: S.NumberFromString }) {}

const Something = { Eff, Gen, DoSomething, GetSomething, GetSomething2, meta: { moduleName: "Something" as const } }

export class SomethingService extends Effect.Service<SomethingService>()("SomethingService", {
  dependencies: [],
  effect: Effect.gen(function*() {
    return {}
  })
}) {}

declare const a: {
  (opt: { a: 1 }): void
  (opt: { a: 2 }): void
  (opt: { b: 3 }): void
  (opt: { b: 3 }): void
}

export class SomethingRepo extends Effect.Service<SomethingRepo>()("SomethingRepo", {
  dependencies: [SomethingService.Default],
  effect: Effect.gen(function*() {
    const smth = yield* SomethingService
    console.log({ smth })
    return {}
  })
}) {}

export class SomethingService2 extends Effect.Service<SomethingService2>()("SomethingService2", {
  dependencies: [],
  effect: Effect.gen(function*() {
    return {}
  })
}) {}

export const { Router, matchAll, matchFor } = makeRouter(middleware, true)

const router = Router(Something)({
  dependencies: [
    SomethingRepo.Default,
    SomethingService.Default,
    SomethingService2.Default
  ],
  *effect(match) {
    const repo = yield* SomethingRepo
    const smth = yield* SomethingService
    const smth2 = yield* SomethingService2

    // this gets catched in 'routes' type
    if (Math.random() > 0.5) {
      return yield* new InvalidStateError("ciao")
    }

    console.log({ repo, smth, smth2 })

    return match({
      Eff: () =>
        Effect
          .gen(function*() {
            const some = yield* Some
            return yield* Effect.logInfo("Some", some)
          }),

      *Gen() {
        const some = yield* Some
        return yield* Effect.logInfo("Some", some)
      },
      *GetSomething(req) {
        console.log(req.id)

        const _b = yield* Effect.succeed(false)
        if (_b) {
          //   expected errors here because RequestError is not a valid error for controllers
          // yield* new RequestError(1 as any)
          // return yield* new RequestError(1 as any)
        }
        if (Math.random() > 0.5) {
          return yield* Effect.succeed("12")
        }
        if (!_b) {
          return yield* new UnauthorizedError()
        } else {
          // expected an error here because a boolean is not a string
          // return _b
          return "12"
        }
      },
      DoSomething: {
        *raw() {
          return yield* Effect.succeed(undefined)
        }
      },
      GetSomething2: {
        raw: Some.use(() => Effect.succeed("12"))
      }
    })
  }
})

// eslint-disable-next-line unused-imports/no-unused-vars
const matched = matchAll({ router })
expectTypeOf({} as Layer.Context<typeof matched>).toEqualTypeOf<SomeService>()

type makeContext = MakeContext<typeof router.make>
expectTypeOf({} as MakeErrors<typeof router.make>).toEqualTypeOf<InvalidStateError>()
expectTypeOf({} as makeContext).toEqualTypeOf<
  SomethingService | SomethingRepo | SomethingService2
>()

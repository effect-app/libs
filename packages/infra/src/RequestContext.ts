import { NonEmptyString255 } from "effect-app/Schema"
import { FiberRef, S } from "effect-app"
import { UserProfileId } from "effect-app/ids"

export const Locale = S.Literal("en", "de")
export type Locale = typeof Locale.Type

export const LocaleRef = FiberRef.unsafeMake<Locale>("en")

/**
 * @tsplus type RequestContext
 * @tsplus companion RequestContext.Ops
 */
export class RequestContext extends S.ExtendedClass<
  RequestContext,
  RequestContext.From
>()({
  span: S.Struct({
    traceId: S.String,
    spanId: S.String,
    sampled: S.Boolean
  }),
  name: NonEmptyString255,
  locale: Locale,
  sourceId: S.optional(NonEmptyString255), // TODO?
  namespace: NonEmptyString255,
  /** @deprecated */
  userProfile: S.optional(S.Struct({ sub: UserProfileId })) //
}) {
  // static Tag = Context.Tag<RequestContext>()

  static toMonitoring(this: void, self: RequestContext) {
    return {
      operationName: self.name,
      locale: self.locale
    }
  }
}

export const spanAttributes = (ctx: Pick<RequestContext, "locale" | "namespace"> & Partial<RequestContext>) => ({
  "request.name": ctx.name,
  "request.locale": ctx.locale,
  "request.namespace": ctx.namespace,
  ...ctx.sourceId ? { "request.source.id": ctx.sourceId } : {},
  ...(ctx.userProfile?.sub
    ? {
      "request.user.sub": ctx
        .userProfile
        .sub,
      "request.user.roles": "roles" in ctx
          .userProfile
        ? ctx.userProfile.roles
        : undefined
    }
    : {})
})

// codegen:start {preset: model}
//
/* eslint-disable */
export namespace RequestContext {
  export interface From extends S.Struct.Encoded<typeof RequestContext["fields"]> {}
}
/* eslint-enable */
//
// codegen:end
//

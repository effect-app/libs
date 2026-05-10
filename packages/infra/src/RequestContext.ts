import * as Context from "effect-app/Context"
import { UserProfileId } from "effect-app/ids"
import * as S from "effect-app/Schema"
import { NonEmptyString255 } from "effect-app/Schema"

export const Locale = S.Literals(["en", "de"])
export type Locale = typeof Locale.Type

export class LocaleRef extends Context.Reference("Locale", { defaultValue: (): Locale => "en" }) {}

export class RequestContext extends S.Opaque<
  RequestContext,
  RequestContext.Encoded
>()(S.Struct({
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
})) {
  // static Tag = Context.Tag<RequestContext>()

  static toMonitoring(this: void, self: RequestContext) {
    return {
      operationName: self.name,
      locale: self.locale
    }
  }
}

export const spanAttributes = (ctx: Pick<RequestContext, "locale" | "namespace"> & Partial<RequestContext>) => ({
  "code.function.name": ctx.name,
  "app.locale": ctx.locale,
  "app.tenant.id": ctx.namespace,
  ...ctx.sourceId ? { "client.id": ctx.sourceId } : {},
  ...(ctx.userProfile?.sub
    ? {
      "user.id": ctx
        .userProfile
        .sub,
      "user.roles": "roles" in ctx
          .userProfile
        ? ctx.userProfile.roles
        : undefined
    }
    : {})
})

// codegen:start {preset: model}
//
export namespace RequestContext {
  export interface Encoded extends S.StructNestedEncoded<typeof RequestContext> {}
}
//
// codegen:end
//

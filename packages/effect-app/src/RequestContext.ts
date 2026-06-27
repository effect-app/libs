import * as Context from "./Context.ts"
import { UserProfileId } from "./ids.ts"
import * as S from "./Schema.ts"
import { NonEmptyString255 } from "./Schema.ts"

export const Locale = S.Literals(["en", "de"])
export type Locale = typeof Locale.Type

export class LocaleRef extends Context.Reference("Locale", { defaultValue: (): Locale => "en" }) {}

export class RequestContext extends S.Opaque<RequestContext>()(S.Struct({
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

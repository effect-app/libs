import * as Context from "./Context.js"
import { UserProfileId } from "./ids.js"
import * as S from "./Schema.js"
import { NonEmptyString255 } from "./Schema.js"

export const Locale = S.Literals(["en", "de"])
export type Locale = typeof Locale.Type

export class LocaleRef extends Context.Reference("Locale", { defaultValue: (): Locale => "en" }) {}

class _RequestContext extends S.Opaque<_RequestContext>()(S.Struct({
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

// codegen:start {preset: modelFacade, className: _RequestContext, schema: S}
export class RequestContext extends S.OpaqueFacadeClass<RequestContext, RequestContext.Encoded, RequestContext.Make, RequestContext.DecodingServices, RequestContext.EncodingServices>()(_RequestContext) {}
// codegen:end

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

// codegen:start {preset: model, static: true, facade: true}
//
export interface RequestContext {
  readonly span: { readonly traceId: string; readonly spanId: string; readonly sampled: boolean; }
  readonly name: S.NonEmptyString255
  readonly locale: "en" | "de"
  readonly namespace: S.NonEmptyString255
  readonly sourceId?: undefined | S.NonEmptyString255
  readonly userProfile?: undefined | { readonly sub: UserProfileId; }
}
export namespace RequestContext {
  export interface Encoded {
    readonly span: { readonly traceId: string; readonly spanId: string; readonly sampled: boolean; }
    readonly name: string
    readonly locale: "en" | "de"
    readonly namespace: string
    readonly sourceId?: undefined | string
    readonly userProfile?: undefined | { readonly sub: string; }
  }
  export interface Make {
    readonly span: { readonly traceId: string; readonly spanId: string; readonly sampled: boolean; }
    readonly name: S.NonEmptyString255
    readonly locale: "en" | "de"
    readonly namespace: S.NonEmptyString255
    readonly sourceId?: undefined | S.NonEmptyString255
    readonly userProfile?: undefined | { readonly sub: UserProfileId; }
  }
  export type DecodingServices = never
  export type EncodingServices = never
}
//
// codegen:end
//

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * We're doing the long way around here with assignTag, TagBase & TagBaseTagged,
 * because there's a typescript compiler issue where it will complain about Equal.symbol, and Hash.symbol not being accessible.
 * https://github.com/microsoft/TypeScript/issues/52644
 */

import { type Effect, Layer, type Scope, type Types } from "effect"
import * as ServiceMap from "effect/ServiceMap"
import { type Yieldable } from "./Effect.js"

export * from "effect/ServiceMap"

export interface Opaque<Self extends object, in out Shape extends object>
  extends ServiceMap.Key<Self, Self>, Yieldable<Opaque<Self, Shape>, Self, never, Self>
{
  // temp while sorting out https://github.com/Effect-TS/effect-smol/pull/1534
  of(this: void, self: Shape): Self
  serviceMap(self: Shape): ServiceMap.ServiceMap<Self>
  // a version that leverages the Shape -> Self conversion
  toLayer: <E, R>(
    eff: Effect.Effect<Shape, E, R>
  ) => Layer.Layer<Self, E, Exclude<R, Scope.Scope>>
  use<A, E, R>(f: (service: Shape) => Effect.Effect<A, E, R>): Effect.Effect<A, E, R | Self>
  useSync<A>(f: (service: Shape) => A): Effect.Effect<A, never, Self>
}

// export interface OpaqueMake<Self extends object, in out Shape extends object, E, R>
//   extends ServiceMap.Service<Self, Self>
// {
//   // temp while sorting out https://github.com/Effect-TS/effect-smol/pull/1534
//   of(self: Shape): Self
//   serviceMap2(self: Shape): ServiceMap.ServiceMap<Self>
//   // a version that leverages the Shape -> Self conversion
//   toLayer: {
//     <E, R>(
//       eff: Effect.Effect<Shape, E, R>
//     ): Layer.Layer<Self, E, Exclude<R, Scope.Scope>>
//     (): Layer.Layer<Self, E, Exclude<R, Scope.Scope>>
//   }
// }

export function assignTag<Identifier extends object, Shape extends object = Identifier>(
  key: string,
  creationError?: Error
) {
  return <S extends object>(cls: S): S & Opaque<Identifier, Shape> => {
    const tag = ServiceMap.Service<Identifier, Shape>(key)
    let fields = tag
    if (Reflect.ownKeys(cls).includes("key")) {
      const { key, ...rest } = tag
      fields = rest as any
    }
    const t = Object.assign(cls, Object.getPrototypeOf(tag), fields)
    if (!creationError) {
      const limit = Error.stackTraceLimit
      Error.stackTraceLimit = 2
      creationError = new Error()
      Error.stackTraceLimit = limit
    }
    // the stack is used to get the location of the tag definition, if a service is not found in the registry
    Object.defineProperty(t, "stack", {
      get() {
        return creationError!.stack
      }
    })
    return t
  }
}

export type ServiceAcessorShape<Self, Type> = Type extends Record<PropertyKey, any> ? {
    [
      k in keyof Type as Type[k] extends ((...args: [...infer Args]) => infer Ret)
        ? ((...args: Readonly<Args>) => Ret) extends Type[k] ? k : never
        : k
    ]: Type[k] extends (...args: [...infer Args]) => Effect.Effect<infer A, infer E, infer R>
      ? (...args: Readonly<Args>) => Effect.Effect<A, E, Self | R>
      : Type[k] extends (...args: [...infer Args]) => infer A
        ? (...args: Readonly<Args>) => Effect.Effect<A, never, Self>
      : Type[k] extends Effect.Effect<infer A, infer E, infer R> ? Effect.Effect<A, E, Self | R>
      : Effect.Effect<Type[k], never, Self>
  }
  : {}

/**
 * Only use this in very specific cases where using dependencies directly is prefered, like inside command handlers.
 */
export const proxify = <T extends object>(Tag: T) =>
<Self, Shape>():
  & T
  & ServiceAcessorShape<Self, Shape> =>
{
  const cache = new Map()
  const done = new Proxy(Tag, {
    get(_target: any, prop: any, _receiver) {
      if (prop === "use") {
        // @ts-expect-error abc
        return (body) => (Tag as any).use(body)
      }
      if (prop in Tag) {
        return (Tag as any)[prop]
      }
      if (cache.has(prop)) {
        return cache.get(prop)
      }
      const fn = (...args: Array<any>) => (Tag as any).use((s: any) => s[prop](...args))
      const cn = (Tag as any).use((s: any) => s[prop])
      // @effect-diagnostics effect/floatingEffect:off
      Object.assign(fn, cn)
      Object.setPrototypeOf(fn, Object.getPrototypeOf(cn))
      cache.set(prop, fn)
      return fn
    }
  })
  return done
}

export const TypeId = "~ServiceMap.Opaque"

// export function Opaque<const Key extends string>(key: Key) {
//   return <Identifier extends object, Shape extends object>() => {
//     const limit = Error.stackTraceLimit
//     Error.stackTraceLimit = 2
//     const creationError = new Error()
//     Error.stackTraceLimit = limit
//     const c: abstract new(_: never) => Shape & { readonly [TypeId]: Key } = class {} as any

//     return assignTag<Identifier, Shape>(key, creationError)(c)
//   }
// }

export interface OpaqueClass<Self extends object, in out Identifier extends string, Shape extends object>
  extends Opaque<Self, Shape>
{
  new(_: never): Shape & { readonly [TypeId]: Identifier }
  readonly key: Identifier
}

// export interface OpaqueClassMake<Self extends object, in out Identifier extends string, Shape extends object, E, R>
//   extends OpaqueMake<Self, Shape, E, R>
// {
//   new(_: never): Shape & { readonly [TypeId]: Identifier }
//   readonly key: Identifier
// }

export const Opaque: {
  <Self extends object, Shape extends object>(): <
    const Identifier extends string,
    E,
    R = Types.unassigned,
    Args extends ReadonlyArray<any> = never
  >(
    id: Identifier,
    options?: {
      readonly make: ((...args: Args) => Effect.Effect<Shape, E, R>) | Effect.Effect<Shape, E, R> | undefined
    }
  ) =>
    & OpaqueClass<Self, Identifier, Shape>
    & ([Types.unassigned] extends [R] ? unknown
      : {
        readonly make: [Args] extends [never] ? Effect.Effect<Shape, E, R>
          : (...args: Args) => Effect.Effect<Shape, E, R>
      })
  <Self extends object>(): <
    const Identifier extends string,
    Make extends Effect.Effect<any, any, any> | ((...args: any) => Effect.Effect<any, any, any>)
  >(
    id: Identifier,
    options: {
      readonly make: Make
    }
  ) =>
    & OpaqueClass<
      Self,
      Identifier,
      Make extends
        | Effect.Effect<infer _A, infer _E, infer _R>
        | ((...args: infer _Args) => Effect.Effect<infer _A, infer _E, infer _R>) ? _A
        : never
    >
    & { readonly make: Make }
} = () => (id: string, options: any) => {
  const svc = ServiceMap.Service()(id, options) as any
  return Object.assign(svc, {
    toLayer: (eff: Effect.Effect<any, any, any>) => {
      return Layer.effect(svc, eff)
    }
  })
}

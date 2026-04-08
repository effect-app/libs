/* eslint-disable @typescript-eslint/no-explicit-any */

import { type Effect, Layer, type Scope, type Types } from "effect"
import * as SM from "effect/ServiceMap"
import { type Yieldable } from "./Effect.js"

export * from "effect/ServiceMap"

export { type ServiceMap as Context } from "effect/ServiceMap"
export { isServiceMap as isContext } from "effect/ServiceMap"

export interface Opaque<Self extends object, in out Shape extends object>
  extends SM.Key<Self, Self>, Yieldable<Opaque<Self, Shape>, Self, never, Self>
{
  of(this: void, self: Shape): Self
  serviceMap(self: Shape): SM.ServiceMap<Self>
  // a version that leverages the Shape -> Self conversion
  toLayer: <E, R>(
    eff: Effect.Effect<Shape, E, R>
  ) => Layer.Layer<Self, E, Exclude<R, Scope.Scope>>
  use<A, E, R>(f: (service: Shape) => Effect.Effect<A, E, R>): Effect.Effect<A, E, R | Self>
  useSync<A>(f: (service: Shape) => A): Effect.Effect<A, never, Self>
}

// export interface OpaqueMake<Self extends object, in out Shape extends object, E, R>
//   extends SM.Service<Self, Self>
// {
//   // temp while sorting out https://github.com/Effect-TS/effect-smol/pull/1534
//   of(self: Shape): Self
//   serviceMap2(self: Shape): SM.ServiceMap<Self>
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
    const tag = SM.Service<Identifier, Shape>(key)
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

/** Accessor for a service method that returns a plain value. Wraps via `useSync`. */
export const accessFn = <
  Self extends object,
  Shape extends Record<PropertyKey, any>,
  K extends keyof Shape
>(
  Tag: Opaque<Self, Shape>,
  key: K
): Shape[K] extends (...args: [...infer Args]) => infer A ? (...args: Readonly<Args>) => Effect.Effect<A, never, Self>
  : never => ((...args: Array<any>) => Tag.useSync((s: any) => s[key](...args))) as any

/** Accessor for a service method that returns an Effect. Delegates via `use`. */
export const accessEffectFn = <
  Self extends object,
  Shape extends Record<PropertyKey, any>,
  K extends keyof Shape
>(
  Tag: Opaque<Self, Shape>,
  key: K
): Shape[K] extends (...args: [...infer Args]) => Effect.Effect<infer A, infer E, infer R>
  ? (...args: Readonly<Args>) => Effect.Effect<A, E, Self | R>
  : never => ((...args: Array<any>) => Tag.use((s: any) => s[key](...args))) as any

/** Accessor for a service property (constant). Wraps via `useSync`. */
export const accessCn = <
  Self extends object,
  Shape extends Record<PropertyKey, any>,
  K extends keyof Shape
>(
  Tag: Opaque<Self, Shape>,
  key: K
): Effect.Effect<Shape[K], never, Self> => Tag.useSync((s) => s[key]) as any

/** Accessor for a service property that is an Effect. Delegates via `use`. */
export const accessEffectCn = <
  Self extends object,
  Shape extends Record<PropertyKey, any>,
  K extends keyof Shape
>(
  Tag: Opaque<Self, Shape>,
  key: K
): Shape[K] extends Effect.Effect<infer A, infer E, infer R> ? Effect.Effect<A, E, Self | R>
  : never => Tag.use((s: any) => s[key]) as any

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
  const svc = SM.Service()(id, options) as any
  return Object.assign(svc, {
    toLayer: (eff: Effect.Effect<any, any, any>) => {
      return Layer.effect(svc, eff)
    }
  })
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * We're doing the long way around here with assignTag, TagBase & TagBaseTagged,
 * because there's a typescript compiler issue where it will complain about Equal.symbol, and Hash.symbol not being accessible.
 * https://github.com/microsoft/TypeScript/issues/52644
 */

import { Effect, Layer, type Scope } from "effect"
import { type NonEmptyReadonlyArray } from "effect/Array"
import type { Layer as L } from "effect/Layer"
import * as ServiceMap from "effect/ServiceMap"

export * from "effect/ServiceMap"

// v3 compatibility aliases
export type Tag<I, S> = ServiceMap.Service<I, S>
export type TagClass<Self, Identifier extends string, Shape> = ServiceMap.ServiceClass<Self, Identifier, Shape>
export type TagClassShape<K extends string, S> = ServiceMap.ServiceClass.Shape<K, S>
export type Context<R> = ServiceMap.ServiceMap<R>
export const GenericTag: typeof ServiceMap.Service = ServiceMap.Service as any

export const ServiceTag = Symbol()
export type ServiceTag = typeof ServiceTag

export abstract class PhantomTypeParameter<Identifier extends keyof any, InstantiatedType> {
  protected abstract readonly [ServiceTag]: {
    readonly [NameP in Identifier]: (_: InstantiatedType) => InstantiatedType
  }
}

export type ServiceShape<T extends ServiceMap.ServiceClass.Shape<any, any>> = Omit<
  T,
  keyof ServiceMap.ServiceClass.Shape<any, any>
>

export abstract class ServiceTagged<ServiceKey> extends PhantomTypeParameter<string, ServiceKey> {}

export function makeService<T extends ServiceTagged<any>>(_: Omit<T, ServiceTag>) {
  return _ as T
}

let i = 0
const randomId = () => "unknown-service-" + i++

export function assignTag<Id, Service = Id>(key?: string, creationError?: Error) {
  return <S extends object>(cls: S): S & ServiceMap.Service<Id, Service> => {
    const tag = ServiceMap.Service<Id, Service>(key ?? randomId())
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

export type ServiceUse<Self, Type> = {
  use: <X>(
    body: (_: Type) => X
  ) => X extends Effect.Effect<infer A, infer E, infer R> ? Effect.Effect<A, E, R | Self>
    : Effect.Effect<X, never, Self>
}

export type ServiceAcessorShape<Self, Type> =
  & (Type extends Record<PropertyKey, any> ? {
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
    : {})
  & ServiceUse<Self, Type>

export const useify = <T extends ServiceMap.Service<any, any>>(Tag: T) => <Self, Shape>(): T & ServiceUse<Self, Shape> => {
  return Object.assign(Tag, { use: (body: any) => Effect.andThen(Effect.service(Tag as any), body) } as ServiceUse<Self, Shape>)
}

export const proxify = <T extends object>(Tag: T) =>
<Self, Shape>():
  & T
  & ServiceAcessorShape<Self, Shape> =>
{
  const cache = new Map()
  const done = new Proxy(Tag, {
    get(_target: any, prop: any, _receiver) {
      if (prop === "use") {
        return (body: any) => Effect.andThen(Effect.service(Tag as any), body)
      }
      if (prop in Tag) {
        return (Tag as any)[prop]
      }
      if (cache.has(prop)) {
        return cache.get(prop)
      }
      const fn = (...args: Array<any>) => Effect.andThen(Effect.service(Tag as any), (s: any) => s[prop](...args))
      const cn = Effect.andThen(Effect.service(Tag as any), (s: any) => s[prop])
      // @effect-diagnostics effect/floatingEffect:off
      Object.assign(fn, cn)
      Object.setPrototypeOf(fn, Object.getPrototypeOf(cn))
      cache.set(prop, fn)
      return fn
    }
  })
  return done
}

export function TagId<const Key extends string>(key: Key) {
  return <Id, ServiceImpl>() => {
    const limit = Error.stackTraceLimit
    Error.stackTraceLimit = 2
    const creationError = new Error()
    Error.stackTraceLimit = limit
    const c:
      & (abstract new(
        service: ServiceImpl
      ) => Readonly<ServiceImpl> & ServiceMap.ServiceClass.Shape<Key, ServiceImpl>)
      & {
        toLayer: <E, R>(
          eff: Effect.Effect<Omit<Id, keyof ServiceMap.ServiceClass.Shape<any, any>>, E, R>
        ) => L<Id, E, R>
        toLayerScoped: <E, R>(
          eff: Effect.Effect<Omit<Id, keyof ServiceMap.ServiceClass.Shape<any, any>>, E, R>
        ) => L<Id, E, Exclude<R, Scope.Scope>>
        of: (service: Omit<Id, keyof ServiceMap.ServiceClass.Shape<any, any>>) => Id
      } = class {
        constructor(service: any) {
          // TODO: instead, wrap the service, and direct calls?
          Object.assign(this, service)
        }
        static of = (service: ServiceImpl) => service
        static toLayer = <E, R>(eff: Effect.Effect<ServiceImpl, E, R>) => {
          return Layer.effect(this as any, eff)
        }
        static toLayerScoped = <E, R>(eff: Effect.Effect<ServiceImpl, E, R>) => {
          return Layer.effect(this as any, eff)
        }
      } as any

    return useify(assignTag<Id, Id>(key, creationError)(c))<Id, ServiceImpl>()
  }
}

export const TagMakeId = <ServiceImpl, R, E, const Key extends string>(
  key: Key,
  make: Effect.Effect<ServiceImpl, E, R>
) =>
<Id>() => {
  const limit = Error.stackTraceLimit
  Error.stackTraceLimit = 2
  const creationError = new Error()
  Error.stackTraceLimit = limit
  const c:
    & (abstract new(
      service: ServiceImpl
    ) => Readonly<ServiceImpl> & ServiceMap.ServiceClass.Shape<Key, ServiceImpl>)
    & {
      toLayer: {
        (): L<Id, E, R>
        <E, R>(eff: Effect.Effect<Omit<Id, keyof ServiceMap.ServiceClass.Shape<any, any>>, E, R>): L<Id, E, R>
      }
      toLayerScoped: {
        (): L<Id, E, Exclude<R, Scope.Scope>>
        <E, R>(
          eff: Effect.Effect<Omit<Id, keyof ServiceMap.ServiceClass.Shape<any, any>>, E, R>
        ): L<Id, E, Exclude<R, Scope.Scope>>
      }
      of: (service: ServiceMap.ServiceClass.Shape<any, any>) => Id
      make: Effect.Effect<Id, E, R>
    } = class {
      constructor(service: any) {
        // TODO: instead, wrap the service, and direct calls?
        Object.assign(this, service)
      }

      static of = (service: ServiceImpl) => service
      static make = make
      // works around an issue where defining layer on the class messes up and causes the Tag to infer to `any, any` :/
      static toLayer = (arg?: any) => {
        return Layer.effect(this as any, arg ?? this.make)
      }

      static toLayerScoped = (arg?: any) => {
        return Layer.effect(this as any, arg ?? this.make)
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any

  return useify(assignTag<Id, Id>(key, creationError)(c))<Id, ServiceImpl>()
}

export const ServiceDef = <Tag extends ServiceMap.Service<any, any>>(self: Tag) =>
<A>() =>
<
  LayerOpts extends {
    effect: Effect.Effect<
      A,
      any,
      any
    >
    dependencies?: NonEmptyReadonlyArray<Layer.Any>
  }
>(opts: LayerOpts): L<Tag, any, any> =>
  Layer.effect(self, opts.effect as any).pipe(
    Layer.provide([Layer.empty, ...opts.dependencies ?? []])
  ) as any

/** @deprecated; use `static Default = Layer.make(this, { effect, dependencies })` instead */
export const DefineService = <
  Tag extends ServiceMap.Service<any, any>,
  LayerOpts extends {
    effect: Effect.Effect<
      ServiceMap.Service.Shape<Tag>,
      any,
      any
    >
    dependencies?: NonEmptyReadonlyArray<Layer.Any>
  }
>(tag: Tag, opts: LayerOpts): Tag & {
  Default: L<
    ServiceMap.Service.Identifier<Tag>,
    any,
    any
  >
} =>
  class extends (tag as any) {
    static readonly Default = ServiceDef<Tag>(tag)<ServiceMap.Service.Shape<Tag>>()(opts)
  } as any

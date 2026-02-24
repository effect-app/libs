/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * We're doing the long way around here with assignTag, TagBase & TagBaseTagged,
 * because there's a typescript compiler issue where it will complain about Equal.symbol, and Hash.symbol not being accessible.
 * https://github.com/microsoft/TypeScript/issues/52644
 */

import { type Effect, Layer, type Scope } from "effect"
import { type NonEmptyReadonlyArray } from "effect/Array"
import * as ServiceMap from "effect/ServiceMap"

export * from "effect/ServiceMap"

export const Reference = ServiceMap.Service as unknown as {
  <Service>(
    key: string,
    options: { readonly defaultValue: () => Service }
  ): ServiceMap.Reference<Service>

  <_Self>(): <Service, const Identifier extends string>(
    key: Identifier,
    options: { readonly defaultValue: () => Service }
  ) => ServiceMap.Reference<Service> & {
    new(_: never): ServiceMap.ServiceClass.Shape<Identifier, Service>
  }
}

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

export function assignTag<Id, Svc = Id>(key?: string, creationError?: Error) {
  return <S extends object>(cls: S): S & ServiceMap.Service<Id, Svc> => {
    const tag = ServiceMap.Service<Id, Svc>(key ?? randomId())
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

export const useify =
  <T extends ServiceMap.Service<any, any>>(Tag: T) => <Self, Shape>(): T & ServiceUse<Self, Shape> => {
    return Object.assign(Tag, { use: (body: any) => (Tag as any).use(body) } as ServiceUse<Self, Shape>)
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

// Local replacements for removed Effect.Service.MakeDeps* types
type MakeDepsE<Opts> = Opts extends { dependencies: ReadonlyArray<Layer.Layer<any, infer E, any>> } ? E : never
type MakeDepsOut<Opts> = Opts extends { dependencies: ReadonlyArray<Layer.Layer<infer Out, any, any>> } ? Out : never
type MakeDepsIn<Opts> = Opts extends { dependencies: ReadonlyArray<Layer.Layer<any, any, infer R>> } ? R : never

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
        ) => Layer.Layer<Id, E, R>
        toLayerScoped: <E, R>(
          eff: Effect.Effect<Omit<Id, keyof ServiceMap.ServiceClass.Shape<any, any>>, E, R>
        ) => Layer.Layer<Id, E, Exclude<R, Scope.Scope>>
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

    return useify(assignTag<Id, ServiceImpl>(key, creationError)(c))<Id, ServiceImpl>()
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
        (): Layer.Layer<Id, E, R>
        <E, R>(eff: Effect.Effect<Omit<Id, keyof ServiceMap.ServiceClass.Shape<any, any>>, E, R>): Layer.Layer<Id, E, R>
      }
      toLayerScoped: {
        (): Layer.Layer<Id, E, Exclude<R, Scope.Scope>>
        <E, R>(
          eff: Effect.Effect<Omit<Id, keyof ServiceMap.ServiceClass.Shape<any, any>>, E, R>
        ): Layer.Layer<Id, E, Exclude<R, Scope.Scope>>
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

  return useify(assignTag<Id, ServiceImpl>(key, creationError)(c))<Id, ServiceImpl>()
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
>(opts: LayerOpts): Layer.Layer<
  Tag,
  | (LayerOpts extends { effect: Effect.Effect<infer _A, infer _E, infer _R> } ? _E
    : never)
  | MakeDepsE<LayerOpts>,
  | Exclude<
    LayerOpts extends { effect: Effect.Effect<infer _A, infer _E, infer _R> } ? _R : never,
    MakeDepsOut<LayerOpts>
  >
  | MakeDepsIn<LayerOpts>
> =>
  Layer.effect(self, opts.effect as any).pipe(
    Layer.provide([Layer.empty, ...opts.dependencies ?? []])
  ) as any

/** @deprecated; use `static Default = Layer.make(this, { effect, dependencies })` instead */
export const DefineService = <
  Tag extends ServiceMap.ServiceClass<any, any, any>,
  LayerOpts extends {
    effect: Effect.Effect<
      ServiceMap.Service.Shape<Tag>,
      any,
      any
    >
    dependencies?: NonEmptyReadonlyArray<Layer.Any>
  }
>(tag: Tag, opts: LayerOpts): Tag & {
  Default: Layer.Layer<
    ServiceMap.Service.Identifier<Tag>,
    | (LayerOpts extends { effect: Effect.Effect<infer _A, infer _E, infer _R> } ? _E
      : never)
    | MakeDepsE<LayerOpts>,
    | Exclude<
      LayerOpts extends { effect: Effect.Effect<infer _A, infer _E, infer _R> } ? _R : never,
      MakeDepsOut<LayerOpts>
    >
    | MakeDepsIn<LayerOpts>
  >
} =>
  class extends (tag as any) {
    static readonly Default = ServiceDef<Tag>(tag)<ServiceMap.Service.Shape<Tag>>()(opts)
  } as any

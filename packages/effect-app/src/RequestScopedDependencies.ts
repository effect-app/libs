import * as Data from "effect/Data"
import * as Context from "./Context.ts"
import * as Effect from "./Effect.ts"
import * as Layer from "./Layer.ts"

export type Root = "root"

export class RequestScopedDependencyNotStartedError extends Data.TaggedError(
  "RequestScopedDependencyNotStartedError"
)<{ readonly key: string }> {}

export interface RequestScopedDependency<Service, E = never, R = never> extends Context.Reference<Service | Root> {
  readonly current: Effect.Effect<Service, RequestScopedDependencyNotStartedError>
  readonly layer: Layer.Layer<never, E, R>
}

export const access = <Service>(
  dependency: Context.Reference<Service | Root>,
  key: string
): Effect.Effect<Service, RequestScopedDependencyNotStartedError> =>
  dependency.pipe(
    Effect.filterOrFail((_) => _ !== "root", () => new RequestScopedDependencyNotStartedError({ key }))
  )

export const make = <Service, E = never, R = never>(
  key: string,
  service: Effect.Effect<Service, E, R>
): RequestScopedDependency<Service, E, R> => {
  const dependency = Context.Reference<Service | Root>(key, { defaultValue: () => "root" })
  return Object.assign(dependency, {
    current: access(dependency, key),
    layer: Layer.effect(dependency, service)
  })
}

export const layer = (
  ...dependencies: ReadonlyArray<RequestScopedDependency<object>>
) => Layer.mergeAll(...dependencies.map((_) => _.layer))

import * as Ref from "effect/Ref"
import * as Stream from "effect/Stream"
import * as Effect from "./Effect.ts"
import * as RequestScopedDependencies from "./RequestScopedDependencies.ts"
import * as S from "./Schema.ts"

export const DataDependency = S.Struct({
  type: S.Literals(["repo", "signal"]),
  name: S.String
})
export type DataDependency = S.Schema.Type<typeof DataDependency>

export const DataDependencies = S.ReadonlySet(DataDependency)
export type DataDependencies = S.Schema.Type<typeof DataDependencies>

export const empty = (): DataDependencies => new Set()

export const DataDependencySet = S.Struct({
  reads: DataDependencies,
  writes: DataDependencies
})
export type DataDependencySet = S.Schema.Type<typeof DataDependencySet>

export interface DataDependencyRecorderService {
  readonly read: (dependency: DataDependency) => Effect.Effect<void>
  readonly write: (dependency: DataDependency) => Effect.Effect<void>
  readonly get: Effect.Effect<DataDependencySet>
  readonly drain: Effect.Effect<DataDependencySet>
  readonly drainWrites: Effect.Effect<DataDependencies>
}

const containsDependency = (dependencies: ReadonlySet<DataDependency>, dependency: DataDependency) => {
  for (const _ of dependencies) {
    if (_.type === dependency.type && _.name === dependency.name) return true
  }
  return false
}

const appendDependency = (dependency: DataDependency) => (dependencies: DataDependencies): DataDependencies =>
  containsDependency(dependencies, dependency) ? dependencies : new Set([...dependencies, dependency])

export const DataDependencyRecorder = RequestScopedDependencies.make(
  "effect-app/DataDependencyRecorder",
  Effect.gen(function*() {
    const readsRef = yield* Ref.make(empty())
    const writesRef = yield* Ref.make(empty())
    return makeDataDependencyRecorder(readsRef, writesRef)
  })
)
export type DataDependencyRecorder = typeof DataDependencyRecorder

export type DataDependencyRecorderNotStartedError = RequestScopedDependencies.RequestScopedDependencyNotStartedError

export const getDataDependencyRecorder = DataDependencyRecorder.current

/**
 * Guarantee a recorder is in scope for `self`, providing a fresh one per request when none is
 * (e.g. a top-level client call with no parent query/command tracking its dependencies). An
 * existing recorder is inherited, so nested calls forward into their parent rather than shadow it.
 */
export const ensureDataDependencyRecorder = <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.flatMap(
    DataDependencyRecorder,
    (current) => current === "root" ? Effect.provide(self, DataDependencyRecorder.layer) : self
  )

/** Stream variant of {@link ensureDataDependencyRecorder}. */
export const ensureDataDependencyRecorderStream = <A, E, R>(self: Stream.Stream<A, E, R>): Stream.Stream<A, E, R> =>
  Stream.unwrap(
    Effect.map(
      DataDependencyRecorder,
      (current) => current === "root" ? Stream.provide(self, DataDependencyRecorder.layer) : self
    )
  )

export const makeDataDependencyRecorder = (
  readsRef: Ref.Ref<DataDependencies>,
  writesRef: Ref.Ref<DataDependencies>
): DataDependencyRecorderService => ({
  read: (dependency) => Ref.update(readsRef, appendDependency(dependency)),
  write: (dependency) => Ref.update(writesRef, appendDependency(dependency)),
  get: Effect.all({
    reads: Ref.get(readsRef),
    writes: Ref.get(writesRef)
  }),
  drain: Effect.all({
    reads: Ref.getAndSet(readsRef, empty()),
    writes: Ref.getAndSet(writesRef, empty())
  }),
  drainWrites: Ref.getAndSet(writesRef, empty())
})

export const repo = (name: string): DataDependency => ({ type: "repo", name })
export const signal = (name: string): DataDependency => ({ type: "signal", name })

export const QueryReadDependenciesMetaKey = "effect-app.query.readDependencies"

export const read = (dependency: DataDependency) =>
  getDataDependencyRecorder.pipe(Effect.flatMap((_) => _.read(dependency)))

export const write = (dependency: DataDependency) =>
  getDataDependencyRecorder.pipe(Effect.flatMap((_) => _.write(dependency)))

export const intersects = (
  a: ReadonlySet<DataDependency>,
  b: ReadonlySet<DataDependency>
) => {
  for (const dependency of a) {
    if (containsDependency(b, dependency)) return true
  }
  return false
}

export const isNonEmpty = (dependencies: DataDependencies) => dependencies.size > 0

import * as Ref from "effect/Ref"
import * as Context from "./Context.ts"
import * as Effect from "./Effect.ts"
import * as S from "./Schema.ts"

export const DataDependency = S.Struct({
  type: S.Literals(["repo", "signal"]),
  name: S.String
})
export type DataDependency = S.Schema.Type<typeof DataDependency>

export const DataDependencies = S.Array(DataDependency)
export type DataDependencies = S.Schema.Type<typeof DataDependencies>

export const DataDependencySet = S.Struct({
  reads: DataDependencies,
  writes: DataDependencies
})
export type DataDependencySet = S.Schema.Type<typeof DataDependencySet>

export interface DataDependencyRecorderService {
  readonly read: (dependency: DataDependency) => Effect.Effect<void>
  readonly write: (dependency: DataDependency) => Effect.Effect<void>
  readonly get: Effect.Effect<DataDependencySet>
  readonly drainWrites: Effect.Effect<DataDependencies>
}

const containsDependency = (dependencies: ReadonlyArray<DataDependency>, dependency: DataDependency) =>
  dependencies.some((_) => _.type === dependency.type && _.name === dependency.name)

const appendDependency = (dependency: DataDependency) => (dependencies: DataDependencies): DataDependencies =>
  containsDependency(dependencies, dependency) ? dependencies : [...dependencies, dependency]

export const DataDependencyRecorder = Context.Reference<DataDependencyRecorderService>(
  "effect-app/DataDependencyRecorder",
  {
    defaultValue: () => ({
      read: (_dependency) => Effect.void,
      write: (_dependency) => Effect.void,
      get: Effect.succeed({ reads: [], writes: [] }),
      drainWrites: Effect.succeed([])
    })
  }
)
export type DataDependencyRecorder = typeof DataDependencyRecorder

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
  drainWrites: Ref.getAndSet(writesRef, [])
})

export const repo = (name: string): DataDependency => ({ type: "repo", name })
export const signal = (name: string): DataDependency => ({ type: "signal", name })

export const QueryReadDependenciesMetaKey = "effect-app.query.readDependencies"

export const read = (dependency: DataDependency) => DataDependencyRecorder.use((_) => _.read(dependency))

export const write = (dependency: DataDependency) => DataDependencyRecorder.use((_) => _.write(dependency))

export const intersects = (
  a: ReadonlyArray<DataDependency>,
  b: ReadonlyArray<DataDependency>
) => a.some((dependency) => containsDependency(b, dependency))

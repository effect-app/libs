import { Context, Effect } from "effect-app"

export interface RegisteredRepository {
  readonly seedNamespace: (namespace: string) => Effect.Effect<void>
}

const make = Effect.sync(() => {
  const repos = new Map<string, RegisteredRepository>()
  return {
    register(modelName: string, repo: RegisteredRepository) {
      repos.set(modelName, repo)
    },
    seedNamespace: (namespace: string) =>
      Effect.suspend(() =>
        Effect.forEach(
          repos.values(),
          (r) => r.seedNamespace(namespace),
          { concurrency: "unbounded", discard: true }
        )
      ),
    get entries(): ReadonlyMap<string, RegisteredRepository> {
      return repos
    }
  }
})

export class RepositoryRegistry extends Context.Opaque<RepositoryRegistry, {
  readonly register: (modelName: string, repo: RegisteredRepository) => void
  readonly seedNamespace: (namespace: string) => Effect.Effect<void>
  readonly entries: ReadonlyMap<string, RegisteredRepository>
}>()("effect-app/RepositoryRegistry", { make }) {}

export const RepositoryRegistryLive = RepositoryRegistry.toLayer(RepositoryRegistry.make)

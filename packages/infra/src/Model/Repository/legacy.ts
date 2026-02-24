import type { Effect, Option, S } from "effect-app"
import type { OptimisticConcurrencyException } from "effect-app/client/errors"

export interface Mapped1<A, IdKey extends keyof A, R> {
  all: Effect.Effect<A[], S.SchemaError, R>
  save: (...xes: readonly A[]) => Effect.Effect<void, OptimisticConcurrencyException | S.SchemaError, R>
  find: (id: A[IdKey]) => Effect.Effect<Option.Option<A>, S.SchemaError, R>
}

// TODO: auto use project, and select fields from the From side of schema only
export interface Mapped2<A, R> {
  all: Effect.Effect<A[], S.SchemaError, R>
}

export interface Mapped<Encoded> {
  <A, R, IdKey extends keyof A>(schema: S.Codec<A, Encoded, R>): Mapped1<A, IdKey, R>
  // TODO: constrain on Encoded2 having to contain only fields that fit Encoded
  <A, Encoded2, R>(schema: S.Codec<A, Encoded2, R>): Mapped2<A, R>
}

export interface MM<Repo, Encoded> {
  <A, R, IdKey extends keyof A>(schema: S.Codec<A, Encoded, R>): Effect.Effect<Mapped1<A, IdKey, R>, never, Repo>
  // TODO: constrain on Encoded2 having to contain only fields that fit Encoded
  <A, Encoded2, R>(schema: S.Codec<A, Encoded2, R>): Effect.Effect<Mapped2<A, R>, never, Repo>
}

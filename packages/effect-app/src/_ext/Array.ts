import { Chunk, Effect, Equal } from "effect-app"
import { NotFoundError } from "../client/errors.js"

function getFirstBy<A, Type extends string>(
  a: Iterable<A>,
  idKey: keyof A,
  id: A[typeof idKey],
  type: Type
) {
  return Chunk
    .fromIterable(a)
    .pipe(
      Chunk.findFirst((_) => Equal.equals(_[idKey], id)),
      Effect.mapError(() => new NotFoundError<Type>({ type, id }))
    )
}

export function makeGetFirstBy<A>() {
  return <const Id extends keyof A, Type extends string>(idKey: Id, type: Type) =>
  (
    a: Iterable<A>,
    id: A[Id]
  ) => getFirstBy(a, idKey, id, type)
}

export const makeGetFirstById = <A extends { id: unknown }>() => <Type extends string>(type: Type) =>
  makeGetFirstBy<A>()("id", type)

export function getFirstById<A extends { id: unknown }, Type extends string>(
  a: Iterable<A>,
  id: A["id"],
  type: Type
) {
  return getFirstBy(a, "id", id, type)
}

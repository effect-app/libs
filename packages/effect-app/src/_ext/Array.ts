import { Chunk, Effect, Equal } from "effect-app"
import { NotFoundError } from "../client/errors.js"

export function makeGetFirstBy<A>() {
  return <const Id extends keyof A, Type extends string>(idKey: Id, type: Type) =>
  (
    a: Iterable<A>,
    id: A[Id]
  ) =>
    Chunk
      .fromIterable(a)
      .pipe(
        Chunk.findFirst((_) => Equal.equals(_[idKey], id)),
        Effect.mapError(() => new NotFoundError<Type>({ type, id }))
      )
}

export const makeGetFirstById = <A extends { id: unknown }>() => <Type extends string>(type: Type) =>
  makeGetFirstBy<A>()("id", type)

export function getFirstById<A extends { id: unknown }, Type extends string>(
  a: Iterable<A>,
  id: A["id"],
  type: Type
) {
  return makeGetFirstById<A>()(type)(a, id)
}

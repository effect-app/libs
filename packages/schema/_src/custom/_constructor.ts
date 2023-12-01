// tracing: off

import * as S from "./_schema.js"
import { hasContinuation, SchemaContinuationSymbol } from "./_schema.js"
import * as Th from "./These.js"

/**
 * @tsplus type ets/Schema/Constructor
 */
export type Constructor<Input, Output, ConstructorError> = {
  (u: Input): Th.These<ConstructorError, Output>
}

export const interpreters: ((
  schema: S.SchemaAny
) => Option<() => Constructor<unknown, unknown, unknown>>)[] = [
  Option.partial(
    (miss) => (schema: S.SchemaAny): () => Constructor<unknown, unknown, unknown> => {
      if (schema instanceof S.SchemaNamed) {
        return () => {
          const self = constructorFor(schema.self)
          return (u) => Th.mapError_(self(u), (e) => S.namedE(schema.name, e))
        }
      }
      if (schema instanceof S.SchemaMapConstructorError) {
        return () => {
          const self = constructorFor(schema.self)
          return (u) => Th.mapError_(self(u), schema.mapError)
        }
      }
      if (schema instanceof S.SchemaIdentity) {
        return () => (u) => Th.succeed(u)
      }
      if (schema instanceof S.SchemaConstructor) {
        return () => schema.of
      }
      if (schema instanceof S.SchemaRefinement) {
        return () => {
          const self = constructorFor(schema.self)
          return (u) =>
            Th.chain_(
              pipe(
                self(u),
                Th.mapError((e) => S.compositionE(Chunk(S.prevE(e))))
              ),
              (
                a,
                w
              ): Th.These<
                S.CompositionE<S.PrevE<unknown> | S.NextE<S.RefinementE<unknown>>>,
                unknown
              > =>
                schema.refinement(a)
                  ? w._tag === "Some"
                    ? Th.warn(a, w.value)
                    : Th.succeed(a)
                  : Th.fail(
                    S.compositionE(
                      w._tag === "None"
                        ? Chunk(S.nextE(S.refinementE(schema.error(a))))
                        : w.value.errors.append(
                          S.nextE(S.refinementE(schema.error(a)))
                        )
                    )
                  )
            )
        }
      }
      return miss()
    }
  )
]

const cache = new WeakMap()

function constructorFor<ParserInput, To, ConstructorInput, From, Api>(
  schema: S.Schema<ParserInput, To, ConstructorInput, From, Api>
): Constructor<ConstructorInput, To, any> {
  if (cache.has(schema)) {
    return cache.get(schema)
  }
  if (schema instanceof S.SchemaLazy) {
    const of_: Constructor<unknown, unknown, unknown> = (__) => constructorFor(schema.self())(__)
    cache.set(schema, of_)
    return of_ as Constructor<ConstructorInput, To, any>
  }
  for (const interpreter of interpreters) {
    const _ = interpreter(schema)
    if (_._tag === "Some") {
      let x: Constructor<unknown, unknown, unknown>
      const of_: Constructor<unknown, unknown, unknown> = (__) => {
        if (!x) {
          x = _.value()
        }
        return x(__)
      }
      cache.set(schema, of_)
      return of_ as Constructor<ConstructorInput, To, any>
    }
  }
  if (hasContinuation(schema)) {
    let x: Constructor<unknown, unknown, unknown>
    const of_: Constructor<unknown, unknown, unknown> = (__) => {
      if (!x) {
        x = constructorFor(schema[SchemaContinuationSymbol])
      }
      return x(__)
    }
    return of_ as Constructor<ConstructorInput, To, any>
  }
  throw new Error(`Missing constructor integration for: ${JSON.stringify(schema)}`)
}

export { constructorFor as for }

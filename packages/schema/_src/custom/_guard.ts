// tracing: off

import * as S from "./_schema.js"
import { hasContinuation, SchemaContinuationSymbol } from "./_schema.js"

export type Guard<T> = { (u: unknown): u is T }

export const interpreters: ((schema: S.SchemaAny) => Option<() => Guard<unknown>>)[] = [
  Option.partial((miss) => (schema: S.SchemaAny): () => Guard<unknown> => {
    if (schema instanceof S.SchemaGuard) {
      return () => schema.guard
    }
    if (schema instanceof S.SchemaIdentity) {
      return () => schema.guard
    }
    if (schema instanceof S.SchemaRefinement) {
      return () => {
        const self = guardFor(schema.self)
        return (u): u is unknown => self(u) && schema.refinement(u)
      }
    }
    return miss()
  })
]

const cache = new WeakMap()

function guardFor<ParserInput, To, ConstructorInput, From, Api>(
  schema: S.Schema<ParserInput, To, ConstructorInput, From, Api>
): Guard<To> {
  if (cache.has(schema)) {
    return cache.get(schema)
  }
  if (schema instanceof S.SchemaLazy) {
    const guard: Guard<unknown> = (__): __ is unknown => guardFor(schema.self())(__)
    cache.set(schema, guard)
    return guard as Guard<To>
  }
  for (const interpreter of interpreters) {
    const _ = interpreter(schema)
    if (_._tag === "Some") {
      let x: Guard<unknown>
      const guard: Guard<unknown> = (__): __ is unknown => {
        if (!x) {
          x = _.value()
        }
        return x(__)
      }
      return guard as Guard<To>
    }
  }
  if (hasContinuation(schema)) {
    let x: Guard<unknown>
    const guard: Guard<unknown> = (__): __ is unknown => {
      if (!x) {
        x = guardFor(schema[SchemaContinuationSymbol])
      }
      return x(__)
    }
    return guard as Guard<To>
  }
  throw new Error(`Missing guard integration for: ${schema.constructor}`)
}

export { guardFor as for }

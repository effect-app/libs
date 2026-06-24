import * as Effect from "effect/Effect"
import type * as Option from "effect/Option"
import { Void as BaseVoid } from "effect/SchemaAST"

export * from "effect/SchemaAST"

/**
 * AST node for a TypeScript `void` return value — overrides effect's
 * `SchemaAST.Void` parser with TypeScript `void` semantics (the effect-smol
 * PR #2475 / `b7d46ab` implementation).
 *
 * Runtime parsing accepts **any present value** and discards it, producing
 * `undefined` — matching a `void` return whose result callers never observe.
 * The decoded/encoded TypeScript representation stays `void`.
 *
 * @see {@link void_} for the singleton instance.
 */
export class Void extends BaseVoid {
  /** @internal — mirrors the PR's `fromAnyToConst(undefined)`. */
  getParser() {
    const succeed = Effect.succeedSome(undefined)
    return (oinput: Option.Option<unknown>) => oinput._tag === "None" ? Effect.succeedNone : succeed
  }
}

const voidNode: Void = new Void()

/** Singleton {@link Void} AST node — overrides effect's `void` singleton. */
export { voidNode as void }

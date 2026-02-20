/* eslint-disable import/no-duplicates */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Option } from "effect"
import * as B from "effect/Brand"
import type * as Brand from "effect/Brand"
import * as Result from "effect/Result"
import * as S from "effect/Schema"

export interface Constructor<in out A extends B.Brand<any>> {
  /**
   * Constructs a branded type from a value of type `A`, throwing an error if
   * the provided `A` is not valid.
   */
  (args: Brand.Brand.Unbranded<A>): A
  /**
   * Constructs a branded type from a value of type `A`, returning `Some<A>`
   * if the provided `A` is valid, `None` otherwise.
   */
  option(args: Brand.Brand.Unbranded<A>): Option.Option<A>
  /**
   * Constructs a branded type from a value of type `A`, returning `Result<A, BrandError>`
   * if the provided `A` is valid, error otherwise.
   */
  result(args: Brand.Brand.Unbranded<A>): Result.Result<A, B.BrandError>
  /**
   * Attempts to refine the provided value of type `A`, returning `true` if
   * the provided `A` is valid, `false` otherwise.
   */
  is(a: Brand.Brand.Unbranded<A>): a is Brand.Brand.Unbranded<A> & A
}

export const fromBrand = <C extends B.Brand<string>>(
  constructor: Constructor<C>,
  options?: S.Annotations.Filter
) =>
// The constraint `{ "Type": Brand.Brand.Unbranded<C> }` on S.fromBrand doesn't evaluate
// cleanly for complex brand hierarchies using Simplify<>. We assert the type invariant
// explicitly since we know `self` is always a schema for the unbranded base type.
<Self extends S.Top>(self: Self): S.brand<Self["~rebuild.out"], B.Brand.Keys<C>> =>
  S.fromBrand(options?.identifier ?? "Brand", constructor)(
    self as unknown as S.Top & { readonly "Type": Brand.Brand.Unbranded<C> }
  ) as S.brand<Self["~rebuild.out"], B.Brand.Keys<C>>

export type Unbranded<P> = P extends B.Brand<any> ? Brand.Brand.Unbranded<P> : P

export const nominal: <A extends B.Brand<any>>() => Constructor<A> = <
  A extends B.Brand<any>
>(): Constructor<
  A
> => B.nominal<A>()

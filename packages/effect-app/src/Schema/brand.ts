/* eslint-disable import/no-duplicates */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import type { Option } from "effect"
import * as B from "effect/Brand"
import type * as Brand from "effect/Brand"
import type * as Result from "effect/Result"
import * as S from "effect/Schema"

export interface Constructor<in out A extends B.Brand<any>> {
  /**
   * Constructs a branded type from a value of type `A`, throwing an error if
   * the provided `A` is not valid.
   */
  (args: Unbranded<A>): A
  /**
   * Constructs a branded type from a value of type `A`, returning `Some<A>`
   * if the provided `A` is valid, `None` otherwise.
   */
  option(args: Unbranded<A>): Option.Option<A>
  /**
   * Constructs a branded type from a value of type `A`, returning `Right<A>`
   * if the provided `A` is valid, `Left<BrandError>` otherwise.
   */
  result(args: Unbranded<A>): Result.Result<A, B.BrandError>
  /**
   * Attempts to refine the provided value of type `A`, returning `true` if
   * the provided `A` is valid, `false` otherwise.
   */
  is(a: Unbranded<A>): a is Unbranded<A> & A
}

export const fromBrand = <C extends Brand.Brand<string>>(
  constructor: Constructor<C>,
  options?: S.Annotations.Filter
) =>
<I, A extends Unbranded<C>>(self: any): any => {
  return S.fromBrand(constructor as any, options as any)(self as any) as any
}

export type Brands<P> = P extends B.Brand<any> ? B.Brand.Brands<P> : never

export type Unbranded<P> = P extends B.Brand<any> ? B.Brand.Unbranded<P> : P

export const nominal: <A extends B.Brand<any>>() => Constructor<A> = <
  A extends B.Brand<any>
>(): Constructor<
  A
> => B.nominal<A>() as any

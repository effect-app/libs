/* eslint-disable import/no-duplicates */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import type { Option } from "effect"
import * as B from "effect/Brand"
import type * as Brand from "effect/Brand"
import type * as Either from "effect/Either"
import * as S from "effect/Schema"

export interface Constructor<in out A extends B.Brand<any>> {
  readonly [B.RefinedConstructorsTypeId]: B.RefinedConstructorsTypeId
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
  either(args: Unbranded<A>): Either.Either<A, Brand.Brand.BrandErrors>
  /**
   * Attempts to refine the provided value of type `A`, returning `true` if
   * the provided `A` is valid, `false` otherwise.
   */
  is(a: Unbranded<A>): a is Unbranded<A> & A
}

export const fromBrand = <C extends Brand.Brand<string | symbol>>(
  constructor: Constructor<C>,
  options?: S.Annotations.Filter<Unbranded<C>>
) =>
<R, I, A extends Unbranded<C>>(self: S.Schema<A, I, R>): S.Schema<A & C, I, R> => {
  return S.fromBrand(constructor as any, options as any)(self as any) as any
}

export type Brands<P> = P extends B.Brand<any> ? { readonly [B.BrandTypeId]: P[B.BrandTypeId] }
  : never

export type Unbranded<P> = P extends infer Q & Brands<P> ? Q : P

export const nominal: <A extends B.Brand<any>>() => Constructor<A> = <
  A extends B.Brand<any>
>(): Constructor<
  A
> => B.nominal<A>() as any

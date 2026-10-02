/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import * as B from "effect/Brand"
import type * as Option from "effect/Option"
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
   * Constructs a branded type from a value of type `A`, returning `Result.succeed`
   * if the provided `A` is valid, `Result.fail` otherwise.
   */
  result(args: Unbranded<A>): Result.Result<A, B.BrandError>
  /**
   * Attempts to refine the provided value of type `A`, returning `true` if
   * the provided `A` is valid, `false` otherwise.
   */
  is(a: Unbranded<A>): a is Unbranded<A> & A
}

type BrandAnnotations = S.Annotations.Filter

export interface BrandedSchema<S extends S.Top, C extends B.Brand<any>> extends
  S.Bottom<
    C,
    S["Encoded"],
    S["DecodingServices"],
    S["EncodingServices"],
    S["ast"],
    BrandedSchema<S, C>,
    S["~type.make.in"],
    S["Iso"],
    S["~type.parameters"],
    C,
    S["~type.mutability"],
    S["~type.optionality"],
    S["~type.constructor.default"],
    S["~encoded.mutability"],
    S["~encoded.optionality"]
  >
{}

export const fromBrand = <C extends B.Brand<any>>(
  _constructor: Constructor<C>,
  options?: BrandAnnotations
) =>
<Self extends S.Top>(self: Self): BrandedSchema<Self, C> => {
  const branded = self.pipe(S.brand("Brand"))
  return (options ? branded.pipe(S.annotate(options)) : branded) as BrandedSchema<Self, C>
}

export type Brands<P> = P extends B.Brand<any> ? B.Brand.Brands<P>
  : never

export type Unbranded<P> = P extends B.Brand<any> ? B.Brand.Unbranded<P> : P

export const nominal: <A extends B.Brand<any>>() => Constructor<A> = <
  A extends B.Brand<any>
>(): Constructor<
  A
> => B.nominal<A>() as any

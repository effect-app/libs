/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import type { Option } from "effect"
import * as B from "effect/Brand"
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

type BrandAnnotations<C extends B.Brand<any>> =
  & S.Annotations.Filter
  & (
    C extends string ? { readonly toArbitrary?: S.Annotations.ToArbitrary.Declaration<C, readonly []> }
      : {}
  )

type BrandedSchema<Self extends S.Top, C extends B.Brand<any>> =
  & Omit<S.brand<Self["Rebuild"], B.Brand.Keys<C>>, "Type" | "Iso" | "~type.make">
  & {
    readonly Type: C
    readonly Iso: C
    readonly "~type.make": C
  }

export const fromBrand = <C extends B.Brand<any>>(
  constructor: Constructor<C>,
  options?: BrandAnnotations<C>
) =>
<Self extends S.Top>(self: Self): BrandedSchema<Self, C> => {
  const branded = S.fromBrand(options?.identifier ?? "Brand", constructor as any)(self as any)
  return options ? (branded as any).pipe(S.annotate(options)) : branded as any
}

export type Brands<P> = P extends B.Brand<any> ? B.Brand.Brands<P>
  : never

export type Unbranded<P> = P extends B.Brand<any> ? B.Brand.Unbranded<P> : P

export const nominal: <A extends B.Brand<any>>() => Constructor<A> = <
  A extends B.Brand<any>
>(): Constructor<
  A
> => B.nominal<A>() as any

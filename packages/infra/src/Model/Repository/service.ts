/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Effect, Option, PubSub, S } from "effect-app"
import type { InvalidStateError, NotFoundError, OptimisticConcurrencyException } from "effect-app/client/errors"
import type { NonNegativeInt } from "effect-app/Schema/numbers"
import { type Equals } from "effect-app/Types"
import type { FieldValues, IsNever, ResolveFirstLevel } from "../filter/types.js"
import type { QAll, Query, QueryProjection } from "../query.js"
import type { Mapped } from "./legacy.js"

export interface Repository<
  T,
  Encoded extends FieldValues,
  Evt,
  ItemType extends string,
  IdKey extends keyof T,
  RSchema,
  RPublish
> {
  readonly itemType: ItemType
  readonly idKey: IdKey
  readonly find: (id: T[IdKey]) => Effect<Option<T>, never, RSchema>
  readonly all: Effect<T[], never, RSchema>
  readonly saveAndPublish: (
    items: Iterable<T>,
    events?: Iterable<Evt>
  ) => Effect<void, InvalidStateError | OptimisticConcurrencyException, RSchema | RPublish>
  readonly changeFeed: PubSub.PubSub<[T[], "save" | "remove"]>
  readonly removeAndPublish: (
    items: Iterable<T>,
    events?: Iterable<Evt>
  ) => Effect<void, never, RSchema | RPublish>

  readonly query: {
    // ending with projection
    <
      A,
      R,
      From extends FieldValues,
      TType extends "one" | "many" | "count" = "many",
      E extends boolean = false
    >(
      q: (
        initial: Query<Encoded>
      ) => QueryProjection<From extends Encoded ? From : never, A, R, TType, E>
    ): Effect.Effect<
      TType extends "many" ? readonly A[] : TType extends "count" ? NonNegativeInt : A,
      | (TType extends "many" ? never : NotFoundError<ItemType>)
      | (TType extends "count" ? never : S.ParseResult.ParseError),
      R | RSchema
    >
    <
      A,
      R,
      From extends FieldValues,
      TType extends "one" | "many" | "count" = "many",
      $A = never,
      E extends boolean = false
    >(
      q1: (
        initial: Query<Encoded>
      ) => $A,
      q2: (
        _: $A
      ) => QueryProjection<From extends Encoded ? From : never, A, R, TType, E>
    ): Effect.Effect<
      TType extends "many" ? readonly A[] : TType extends "count" ? NonNegativeInt : A,
      | (TType extends "many" ? never : NotFoundError<ItemType>)
      | (TType extends "count" ? never : S.ParseResult.ParseError),
      R | RSchema
    >
    <
      A,
      R,
      From extends FieldValues,
      TType extends "one" | "many" | "count" = "many",
      $A = never,
      $B = never,
      E extends boolean = false
    >(
      q1: (
        initial: Query<Encoded>
      ) => $A,
      q2: (_: $A) => $B,
      q3: (
        _: $B
      ) => QueryProjection<From extends Encoded ? From : never, A, R, TType, E>
    ): Effect.Effect<
      TType extends "many" ? readonly A[] : TType extends "count" ? NonNegativeInt : A,
      | (TType extends "many" ? never : NotFoundError<ItemType>)
      | (TType extends "count" ? never : S.ParseResult.ParseError),
      R | RSchema
    >
    <
      A,
      R,
      From extends FieldValues,
      TType extends "one" | "many" | "count" = "many",
      $A = never,
      $B = never,
      $C = never,
      E extends boolean = false
    >(
      q1: (
        initial: Query<Encoded>
      ) => $A,
      q2: (_: $A) => $B,
      q3: (_: $B) => $C,
      q4: (
        _: $C
      ) => QueryProjection<From extends Encoded ? From : never, A, R, TType, E>
    ): Effect.Effect<
      TType extends "many" ? readonly A[] : TType extends "count" ? NonNegativeInt : A,
      | (TType extends "many" ? never : NotFoundError<ItemType>)
      | (TType extends "count" ? never : S.ParseResult.ParseError),
      R | RSchema
    >
    <
      A,
      R,
      From extends FieldValues,
      TType extends "one" | "many" | "count" = "many",
      $A = never,
      $B = never,
      $C = never,
      $D = never,
      E extends boolean = false
    >(
      q1: (
        initial: Query<Encoded>
      ) => $A,
      q2: (_: $A) => $B,
      q3: (_: $B) => $C,
      q4: (_: $C) => $D,
      q5: (
        _: $D
      ) => QueryProjection<From extends Encoded ? From : never, A, R, TType, E>
    ): Effect.Effect<
      TType extends "many" ? readonly A[] : TType extends "count" ? NonNegativeInt : A,
      | (TType extends "many" ? never : NotFoundError<ItemType>)
      | (TType extends "count" ? never : S.ParseResult.ParseError),
      R | RSchema
    >
    <
      A,
      R,
      From extends FieldValues,
      TType extends "one" | "many" | "count" = "many",
      $A = never,
      $B = never,
      $C = never,
      $D = never,
      $E = never,
      E extends boolean = false
    >(
      q1: (
        initial: Query<Encoded>
      ) => $A,
      q2: (_: $A) => $B,
      q3: (_: $B) => $C,
      q4: (_: $C) => $D,
      q5: (_: $D) => $E,
      q6: (_: $E) => QueryProjection<From extends Encoded ? From : never, A, R, TType, E>
    ): Effect.Effect<
      TType extends "many" ? readonly A[] : TType extends "count" ? NonNegativeInt : A,
      | (TType extends "many" ? never : NotFoundError<ItemType>)
      | (TType extends "count" ? never : S.ParseResult.ParseError),
      R | RSchema
    >
    <
      A,
      R,
      From extends FieldValues,
      TType extends "one" | "many" | "count" = "many",
      $A = never,
      $B = never,
      $C = never,
      $D = never,
      $E = never,
      $F = never,
      E extends boolean = false
    >(
      q1: (
        initial: Query<Encoded>
      ) => $A,
      q2: (_: $A) => $B,
      q3: (_: $B) => $C,
      q4: (_: $C) => $D,
      q5: (_: $D) => $E,
      q6: (_: $E) => $F,
      q7: (_: $F) => QueryProjection<From extends Encoded ? From : never, A, R, TType, E>
    ): Effect.Effect<
      TType extends "many" ? readonly A[] : TType extends "count" ? NonNegativeInt : A,
      | (TType extends "many" ? never : NotFoundError<ItemType>)
      | (TType extends "count" ? never : S.ParseResult.ParseError),
      R | RSchema
    >
    <
      A,
      R,
      From extends FieldValues,
      TType extends "one" | "many" | "count" = "many",
      $A = never,
      $B = never,
      $C = never,
      $D = never,
      $E = never,
      $F = never,
      $G = never,
      E extends boolean = false
    >(
      q1: (
        initial: Query<Encoded>
      ) => $A,
      q2: (_: $A) => $B,
      q3: (_: $B) => $C,
      q4: (_: $C) => $D,
      q5: (_: $D) => $E,
      q6: (_: $E) => $F,
      q7: (_: $F) => $G,
      q8: (_: $G) => QueryProjection<From extends Encoded ? From : never, A, R, TType, E>
    ): Effect.Effect<
      TType extends "many" ? readonly A[] : TType extends "count" ? NonNegativeInt : A,
      | (TType extends "many" ? never : NotFoundError<ItemType>)
      | (TType extends "count" ? never : S.ParseResult.ParseError),
      R | RSchema
    >
    <
      A,
      R,
      From extends FieldValues,
      TType extends "one" | "many" | "count" = "many",
      $A = never,
      $B = never,
      $C = never,
      $D = never,
      $E = never,
      $F = never,
      $G = never,
      $H = never,
      E extends boolean = false
    >(
      q1: (
        initial: Query<Encoded>
      ) => $A,
      q2: (_: $A) => $B,
      q3: (_: $B) => $C,
      q4: (_: $C) => $D,
      q5: (_: $D) => $E,
      q6: (_: $E) => $F,
      q7: (_: $F) => $G,
      q8: (_: $G) => $H,
      q9: (_: $H) => QueryProjection<From extends Encoded ? From : never, A, R, TType, E>
    ): Effect.Effect<
      TType extends "many" ? readonly A[] : TType extends "count" ? NonNegativeInt : A,
      | (TType extends "many" ? never : NotFoundError<ItemType>)
      | (TType extends "count" ? never : S.ParseResult.ParseError),
      R | RSchema
    >
    <
      A,
      R,
      From extends FieldValues,
      TType extends "one" | "many" | "count" = "many",
      $A = never,
      $B = never,
      $C = never,
      $D = never,
      $E = never,
      $F = never,
      $G = never,
      $H = never,
      $I = never,
      E extends boolean = false
    >(
      q1: (
        initial: Query<Encoded>
      ) => $A,
      q2: (_: $A) => $B,
      q3: (_: $B) => $C,
      q4: (_: $C) => $D,
      q5: (_: $D) => $E,
      q6: (_: $E) => $F,
      q7: (_: $F) => $G,
      q8: (_: $G) => $H,
      q9: (_: $H) => $I,
      q10: (_: $I) => QueryProjection<From extends Encoded ? From : never, A, R, TType, E>
    ): Effect.Effect<
      TType extends "many" ? readonly A[] : TType extends "count" ? NonNegativeInt : A,
      | (TType extends "many" ? never : NotFoundError<ItemType>)
      | (TType extends "count" ? never : S.ParseResult.ParseError),
      R | RSchema
    >

    // ending with generic query
    <
      R = never,
      TType extends "one" | "many" = "many",
      EncodedRefined extends Encoded = Encoded,
      E extends boolean = false
    >(
      q: (initial: Query<Encoded>) => QAll<Encoded, EncodedRefined, RefineTHelper<T, EncodedRefined>, R, TType, E>
    ): Effect.Effect<
      TType extends "many" ? DistributeQueryIfExclusiveOnArray<E, T, EncodedRefined> : RefineTHelper<T, EncodedRefined>,
      TType extends "many" ? never : NotFoundError<ItemType>,
      R | RSchema
    >
    <
      R = never,
      TType extends "one" | "many" = "many",
      EncodedRefined extends Encoded = Encoded,
      $A = never,
      E extends boolean = false
    >(
      q1: (initial: Query<Encoded>) => $A,
      q2: (
        _: $A
      ) => QAll<Encoded, EncodedRefined, RefineTHelper<T, EncodedRefined>, R, TType, E>
    ): Effect.Effect<
      TType extends "many" ? DistributeQueryIfExclusiveOnArray<E, T, EncodedRefined> : RefineTHelper<T, EncodedRefined>,
      TType extends "many" ? never : NotFoundError<ItemType>,
      R | RSchema
    >
    <
      R = never,
      TType extends "one" | "many" = "many",
      EncodedRefined extends Encoded = Encoded,
      $A = never,
      $B = never,
      E extends boolean = false
    >(
      q1: (initial: Query<Encoded>) => $A,
      q2: (
        _: $A
      ) => $B,
      q3: (
        _: $B
      ) => QAll<Encoded, EncodedRefined, RefineTHelper<T, EncodedRefined>, R, TType, E>
    ): Effect.Effect<
      TType extends "many" ? DistributeQueryIfExclusiveOnArray<E, T, EncodedRefined> : RefineTHelper<T, EncodedRefined>,
      TType extends "many" ? never : NotFoundError<ItemType>,
      R | RSchema
    >
    <
      R = never,
      TType extends "one" | "many" = "many",
      EncodedRefined extends Encoded = Encoded,
      $A = never,
      $B = never,
      $C = never,
      E extends boolean = false
    >(
      q1: (initial: Query<Encoded>) => $A,
      q2: (_: $A) => $B,
      q3: (_: $B) => $C,
      q4: (
        _: $C
      ) => QAll<Encoded, EncodedRefined, RefineTHelper<T, EncodedRefined>, R, TType, E>
    ): Effect.Effect<
      TType extends "many" ? DistributeQueryIfExclusiveOnArray<E, T, EncodedRefined> : RefineTHelper<T, EncodedRefined>,
      TType extends "many" ? never : NotFoundError<ItemType>,
      R | RSchema
    >
    <
      R = never,
      TType extends "one" | "many" = "many",
      EncodedRefined extends Encoded = Encoded,
      $A = never,
      $B = never,
      $C = never,
      $D = never,
      E extends boolean = false
    >(
      q1: (initial: Query<Encoded>) => $A,
      q2: (_: $A) => $B,
      q3: (_: $B) => $C,
      q4: (_: $C) => $D,
      q5: (
        _: $D
      ) => QAll<Encoded, EncodedRefined, RefineTHelper<T, EncodedRefined>, R, TType, E>
    ): Effect.Effect<
      TType extends "many" ? DistributeQueryIfExclusiveOnArray<E, T, EncodedRefined> : RefineTHelper<T, EncodedRefined>,
      TType extends "many" ? never : NotFoundError<ItemType>,
      R | RSchema
    >
    <
      R = never,
      TType extends "one" | "many" = "many",
      EncodedRefined extends Encoded = Encoded,
      $A = never,
      $B = never,
      $C = never,
      $D = never,
      $E = never,
      E extends boolean = false
    >(
      q1: (initial: Query<Encoded>) => $A,
      q2: (_: $A) => $B,
      q3: (_: $B) => $C,
      q4: (_: $C) => $D,
      q5: (_: $D) => $E,
      q6: (
        _: $E
      ) => QAll<Encoded, EncodedRefined, RefineTHelper<T, EncodedRefined>, R, TType, E>
    ): Effect.Effect<
      TType extends "many" ? DistributeQueryIfExclusiveOnArray<E, T, EncodedRefined> : RefineTHelper<T, EncodedRefined>,
      TType extends "many" ? never : NotFoundError<ItemType>,
      R | RSchema
    >
    <
      R = never,
      TType extends "one" | "many" = "many",
      EncodedRefined extends Encoded = Encoded,
      $A = never,
      $B = never,
      $C = never,
      $D = never,
      $E = never,
      $F = never,
      E extends boolean = false
    >(
      q1: (initial: Query<Encoded>) => $A,
      q2: (_: $A) => $B,
      q3: (_: $B) => $C,
      q4: (_: $C) => $D,
      q5: (_: $D) => $E,
      q6: (_: $E) => $F,
      q7: (
        _: $F
      ) => QAll<Encoded, EncodedRefined, RefineTHelper<T, EncodedRefined>, R, TType, E>
    ): Effect.Effect<
      TType extends "many" ? DistributeQueryIfExclusiveOnArray<E, T, EncodedRefined> : RefineTHelper<T, EncodedRefined>,
      TType extends "many" ? never : NotFoundError<ItemType>,
      R | RSchema
    >
    <
      R = never,
      TType extends "one" | "many" = "many",
      EncodedRefined extends Encoded = Encoded,
      $A = never,
      $B = never,
      $C = never,
      $D = never,
      $E = never,
      $F = never,
      $G = never,
      E extends boolean = false
    >(
      q1: (initial: Query<Encoded>) => $A,
      q2: (_: $A) => $B,
      q3: (_: $B) => $C,
      q4: (_: $C) => $D,
      q5: (_: $D) => $E,
      q6: (_: $E) => $F,
      q7: (_: $F) => $G,
      q8: (
        _: $G
      ) => QAll<Encoded, EncodedRefined, RefineTHelper<T, EncodedRefined>, R, TType, E>
    ): Effect.Effect<
      TType extends "many" ? DistributeQueryIfExclusiveOnArray<E, T, EncodedRefined>
        : RefineTHelper<T, EncodedRefined>,
      TType extends "many" ? never : NotFoundError<ItemType>,
      R | RSchema
    >
    <
      R = never,
      TType extends "one" | "many" = "many",
      EncodedRefined extends Encoded = Encoded,
      $A = never,
      $B = never,
      $C = never,
      $D = never,
      $E = never,
      $F = never,
      $G = never,
      $H = never,
      E extends boolean = false
    >(
      q1: (initial: Query<Encoded>) => $A,
      q2: (_: $A) => $B,
      q3: (_: $B) => $C,
      q4: (_: $C) => $D,
      q5: (_: $D) => $E,
      q6: (_: $E) => $F,
      q7: (_: $F) => $G,
      q8: (_: $G) => $H,
      q9: (
        _: $H
      ) => QAll<Encoded, EncodedRefined, RefineTHelper<T, EncodedRefined>, R, TType, E>
    ): Effect.Effect<
      TType extends "many" ? DistributeQueryIfExclusiveOnArray<E, T, EncodedRefined>
        : RefineTHelper<T, EncodedRefined>,
      TType extends "many" ? never : NotFoundError<ItemType>,
      R | RSchema
    >
    <
      R = never,
      TType extends "one" | "many" = "many",
      EncodedRefined extends Encoded = Encoded,
      $A = never,
      $B = never,
      $C = never,
      $D = never,
      $E = never,
      $F = never,
      $G = never,
      $H = never,
      $I = never,
      E extends boolean = false
    >(
      q1: (initial: Query<Encoded>) => $A,
      q2: (_: $A) => $B,
      q3: (_: $B) => $C,
      q4: (_: $C) => $D,
      q5: (_: $D) => $E,
      q6: (_: $E) => $F,
      q7: (_: $F) => $G,
      q8: (_: $G) => $H,
      q9: (_: $H) => $I,
      q10: (
        _: $I
      ) => QAll<Encoded, EncodedRefined, RefineTHelper<T, EncodedRefined>, R, TType, E>
    ): Effect.Effect<
      TType extends "many" ? DistributeQueryIfExclusiveOnArray<E, T, EncodedRefined>
        : RefineTHelper<T, EncodedRefined>,
      TType extends "many" ? never : NotFoundError<ItemType>,
      R | RSchema
    >
  }

  /** @deprecated use query */
  readonly mapped: Mapped<Encoded>
}

type DistributeQueryIfExclusiveOnArray<Exclusive extends boolean, T, EncodedRefined> = [Exclusive] extends [true]
  ? T extends any ? RefineTHelper<T, EncodedRefined> extends infer R ? IsNever<R> extends true ? never
      : readonly R[]
    : never
  : never
  : readonly RefineTHelper<T, EncodedRefined>[]

type NullableRefined<T, EncodedRefined> = {
  // EncodedRefined may be a union, so if you just keyof you'll get just common keys
  // p.s. NullableRefined is homomorphic in T so it distributes itself over T
  [k in keyof T]: [null] extends [T[k]] ? [null] extends [Extract<EncodedRefined, { [j in k]: any }>[k]] ? T[k]
    : Exclude<T[k], null>
    : T[k]
}

// for DX purposes
type ShouldRecursiveExtractTagged<T, EncodedRefined> = true extends {
  [k in keyof T]: "_tag" extends keyof T[k]
    ? k extends keyof EncodedRefined ? "_tag" extends keyof EncodedRefined[k] ? true
      : false
    : false
    : false
}[keyof T] ? true
  : false

// support is not 100% but we have to make compromises
type RecursiveExtractTagged<T, EncodedRefined> = ShouldRecursiveExtractTagged<T, EncodedRefined> extends true ? {
    [k in keyof T]: "_tag" extends keyof T[k]
      ? k extends keyof EncodedRefined ? "_tag" extends keyof EncodedRefined[k] ? ExtractTagged<T[k], EncodedRefined[k]>
        : T[k]
      : T[k]
      : T[k]
  }
  : T

type ExtractTagged_<T, EncodedRefined> = EncodedRefined extends { _tag: string }
  ? T extends { _tag: string } ? Extract<T, { _tag: EncodedRefined["_tag"] }>
  : T
  : T

type ExtractTagged<T, EncodedRefined> = ExtractTagged_<T, EncodedRefined> extends infer R
  ? RecursiveExtractTagged<RecusiveExtractIded<R, EncodedRefined>, EncodedRefined> extends infer R2 ? NullableRefined<
      R2,
      EncodedRefined
    > extends infer R3 ? Equals<
        R2,
        R3
      > extends true ? R2
      : ResolveFirstLevel<R3>
    : never
  : never
  : never

type ShouldRecursiveExtractIded<T, EncodedRefined> = true extends {
  [k in keyof T]: "id" extends keyof T[k] ? k extends keyof EncodedRefined ? "id" extends keyof EncodedRefined[k] ? true
      : false
    : false
    : false
}[keyof T] ? true
  : false

type RecusiveExtractIded<T, EncodedRefined> = ShouldRecursiveExtractIded<T, EncodedRefined> extends true ? {
    [k in keyof T]: "id" extends keyof T[k]
      ? k extends keyof EncodedRefined ? "id" extends keyof EncodedRefined[k] ? ExtractIded<T[k], EncodedRefined[k]>
        : T[k]
      : T[k]
      : T[k]
  }
  : T

type ExtractIded_<T, EncodedRefined> = EncodedRefined extends { id: string }
  ? T extends { id: string } ? Extract<T, { id: EncodedRefined["id"] }>
  : T
  : T

type ExtractIded<T, EncodedRefined> = ExtractIded_<T, EncodedRefined> extends infer R
  ? RecusiveExtractIded<RecursiveExtractTagged<R, EncodedRefined>, EncodedRefined> extends infer R2
    ? NullableRefined<R2, EncodedRefined> extends infer R3 ? Equals<
        R2,
        R3
      > extends true ? R2
      : ResolveFirstLevel<R3>
    : never
  : never
  : never

export type RefineTHelper<T, EncodedRefined> = ResolveFirstLevel<
  NullableRefined<
    ExtractIded<ExtractTagged<T, EncodedRefined>, EncodedRefined>,
    EncodedRefined
  >
>

/* eslint-disable @typescript-eslint/no-unused-vars */
// ets_tracing: off
import type { NonEmptyArray } from "@effect-ts/core/Collections/Immutable/NonEmptyArray"
import type { Either } from "@effect-ts/core/Either"
import type { Equal } from "@effect-ts/core/Equal"
import type { Predicate, Refinement } from "@effect-ts/core/Function"
import type { Ord } from "@effect-ts/core/Ord"
import type * as ARR from "@effect-ts-app/core/Array"
import type { Chunk } from "@effect-ts-app/core/Chunk"
import type { Effect } from "@effect-ts-app/core/Effect"
import type * as SET from "@effect-ts-app/core/Set"
import type { Sync } from "@effect-ts-app/core/Sync"

interface AOps {
  /**
   * @ets_rewrite_method map_ from "@effect-ts/core/Collections/Immutable/NonEmptyArray"
   */
  mapRA<A, B>(this: NonEmptyArray<A>, f: (a: A) => B): NonEmptyArray<B>
  /**
   * @ets_rewrite_method map_ from "@effect-ts-app/core/Array"
   */
  mapRA<A, B>(this: readonly A[], f: (a: A) => B): readonly B[]

  /**
   * @ets_rewrite_method mapWithIndex_ from "@effect-ts-app/core/Array"
   */
  mapWithIndex<A, B>(
    this: NonEmptyArray<A>,
    f: (idx: number, a: A) => B
  ): NonEmptyArray<B>
  /**
   * @ets_rewrite_method mapWithIndex_ from "@effect-ts-app/core/Array"
   */
  mapWithIndex<A, B>(this: readonly A[], f: (idx: number, a: A) => B): readonly B[]

  /**
   * @ets_rewrite_method concat_ from "@effect-ts-app/core/Array"
   */
  concatRA<A, A1>(this: NonEmptyArray<A>, y: readonly A1[]): NonEmptyArray<A | A1>

  /**
   * @ets_rewrite_method concat_ from "@effect-ts-app/core/Array"
   */
  concatRA<A, A1>(this: readonly A[], y: NonEmptyArray<A1>): NonEmptyArray<A | A1>
  /**
   * @ets_rewrite_method concat_ from "@effect-ts-app/core/Array"
   */
  concatRA<A, A1>(this: readonly A[], y: readonly A1[]): readonly (A | A1)[]

  /**
   * @ets_rewrite_method sort_ from "@effect-ts-app/fluent/_ext/Array"
   */
  sortWith<A>(this: NonEmptyArray<A>, o: Ord<A>): NonEmptyArray<A>

  /**
   * @ets_rewrite_method sort_ from "@effect-ts-app/fluent/_ext/Array"
   */
  sortWith<A>(this: readonly A[], o: Ord<A>): readonly A[]

  /**
   * @ets_rewrite_method sortBy_ from "@effect-ts-app/fluent/_ext/Array"
   */
  sortBy<A>(this: NonEmptyArray<A>, ords: readonly Ord<A>[]): NonEmptyArray<A>
  /**
   * @ets_rewrite_method sortBy_ from "@effect-ts-app/fluent/_ext/Array"
   */
  sortBy<A>(this: readonly A[], ords: readonly Ord<A>[]): readonly A[]

  /**
   * @ets_rewrite_method append_ from "@effect-ts-app/core/Array"
   */
  append<AX>(this: NonEmptyArray<AX>, end: AX): NonEmptyArray<AX>

  /**
   * @ets_rewrite_method append_ from "@effect-ts-app/core/Array"
   */
  append<AX>(this: ARR.Array<AX>, end: AX): ARR.Array<AX>

  // replacement for mapM
  /**
   * @ets_rewrite_method mapEffect_ from "@effect-ts-app/core/Array"
   */
  mapEffect<AX, R, E, B>(
    this: NonEmptyArray<AX>,
    f: (a: AX) => Effect<R, E, B>
  ): Effect<R, E, NonEmptyArray<B>>
  /**
   * @ets_rewrite_method mapEffect_ from "@effect-ts-app/core/Array"
   */
  mapEffect<AX, R, E, B>(
    this: ARR.Array<AX>,
    f: (a: AX) => Effect<R, E, B>
  ): Effect<R, E, readonly B[]>

  /**
   * @ets_rewrite_method mapSync_ from "@effect-ts-app/core/Array"
   */
  mapSync<AX, R, E, B>(
    this: NonEmptyArray<AX>,
    f: (a: AX) => Sync<R, E, B>
  ): Sync<R, E, NonEmptyArray<B>>
  /**
   * @ets_rewrite_method mapSync_ from "@effect-ts-app/core/Array"
   */
  mapSync<AX, R, E, B>(
    this: ARR.Array<AX>,
    f: (a: AX) => Sync<R, E, B>
  ): Sync<R, E, readonly B[]>

  /**
   * @ets_rewrite_method mapEither_ from "@effect-ts/fluent/Fx/Array"
   */
  mapEither<AX, E, B>(
    this: NonEmptyArray<AX>,
    f: (a: AX) => Either<E, B>
  ): Either<E, NonEmptyArray<B>>

  /**
   * @ets_rewrite_method mapEither_ from "@effect-ts/fluent/Fx/Array"
   */
  mapEither<AX, E, B>(
    this: ARR.Array<AX>,
    f: (a: AX) => Either<E, B>
  ): Either<E, ARR.Array<B>>

  /**
   * @ets_rewrite_method mapOption_ from "@effect-ts/fluent/Fx/Array"
   */
  mapOption<AX, B>(
    this: NonEmptyArray<AX>,
    f: (a: AX) => Option<B>
  ): Option<ARR.Array<B>>

  /**
   * @ets_rewrite_method mapOption_ from "@effect-ts/fluent/Fx/Array"
   */
  mapOption<AX, B>(this: ARR.Array<AX>, f: (a: AX) => Option<B>): Option<ARR.Array<B>>

  /**
   * @ets_rewrite_method mapEffect_ from "@effect-ts-app/core/Array"
   */
  mapM<AX, R, E, B>(
    this: NonEmptyArray<AX>,
    f: (a: AX) => Effect<R, E, B>
  ): Effect<R, E, NonEmptyArray<B>>

  /**
   * @ets_rewrite_method mapEffect_ from "@effect-ts-app/core/Array"
   */
  mapM<AX, R, E, B>(
    this: NonEmptyArray<AX>,
    f: (a: AX) => Sync<R, E, B>
  ): Effect<R, E, NonEmptyArray<B>> // Maps to Effect always

  /**
   * @ets_rewrite_method mapM_ from "@effect-ts-app/fluent/_ext/mapM"
   */
  mapM<AX, E, B>(
    this: NonEmptyArray<AX>,
    f: (a: AX) => Either<E, B>
  ): Effect<unkown, E, NonEmptyArray<B>>

  /**
   * @ets_rewrite_method mapM_ from "@effect-ts-app/fluent/_ext/mapM"
   */
  mapM<AX, B>(
    this: NonEmptyArray<AX>,
    f: (a: AX) => Option<B>
  ): Effect<unkown, Option<never>, NonEmptyArray<B>>

  /**
   * @ets_rewrite_method mapEffect_ from "@effect-ts-app/core/Array"
   */
  mapM<AX, R, E, B>(
    this: ARR.Array<AX>,
    f: (a: AX) => Effect<R, E, B>
  ): Effect<R, E, readonly B[]>

  /**
   * @ets_rewrite_method mapEffect_ from "@effect-ts-app/core/Array"
   */
  mapM<AX, R, E, B>(
    this: ARR.Array<AX>,
    f: (a: AX) => Sync<R, E, B>
  ): Effect<R, E, readonly B[]> // Maps to Effect always

  /**
   * @ets_rewrite_method mapM_ from "@effect-ts-app/fluent/_ext/mapM"
   */
  mapM<AX, E, B>(
    this: ARR.Array<AX>,
    f: (a: AX) => Either<E, B>
  ): Effect<unkown, E, readonly B[]>

  /**
   * @ets_rewrite_method mapM_ from "@effect-ts-app/fluent/_ext/mapM"
   */
  mapM<AX, B>(
    this: ARR.Array<AX>,
    f: (a: AX) => Option<B>
  ): Effect<unkown, Option<never>, readonly B[]>

  /**
   * @ets_rewrite_method flatten from "@effect-ts-app/core/Array"
   */
  flatten<A>(this: ARR.Array<ARR.Array<A>>): ARR.Array<A>

  /**
   * @ets_rewrite_method collect_ from "@effect-ts-app/core/Array"
   */
  collect<A, B>(this: readonly A[], f: (a: A) => Option<B>): readonly B[]

  /**
   * @ets_rewrite_method find_ from "@effect-ts-app/core/Array"
   */
  findFirst<A>(this: readonly A[], predicate: Predicate<A>): Option<A>

  /**
   * @ets_rewrite_method findFirstMap_ from "@effect-ts-app/core/Array"
   */
  findFirstMap<A, B>(this: readonly A[], f: (a: A) => Option<B>): Option<B>

  /**
   * @ets_rewrite_method filter_ from "@effect-ts-app/core/Array"
   */
  filterRA<A, S extends A>(this: readonly A[], f: (a: A) => a is S): readonly S[]

  /**
   * @ets_rewrite_method filter_ from "@effect-ts-app/core/Array"
   */
  filterRA<A>(this: readonly A[], f: (a: A) => boolean): readonly A[]

  /**
   * @ets_rewrite_method uniq_ from "@effect-ts-app/fluent/_ext/Array"
   */
  uniq<A>(this: readonly A[], E: Equal<A>): readonly A[]

  /**
   * @ets_rewrite_method head from "@effect-ts-app/core/Array"
   */
  head<A>(this: readonly A[]): Option<A>

  /**
   * @ets_rewrite_method last from "@effect-ts-app/core/Array"
   */
  last<A>(this: readonly A[]): Option<A>

  /**
   * @ets_rewrite_method tail from "@effect-ts-app/core/Array"
   */
  tail<A>(this: readonly A[]): Option<readonly A[]>
}

interface SOps {
  /**
   * @ets_rewrite_method filter_ from "@effect-ts/core/Collections/Immutable/Set"
   */
  filter<A, B extends A>(this: SET.Set<A>, refinement: Refinement<A, B>): SET.Set<B>
  /**
   * @ets_rewrite_method filter_ from "@effect-ts/core/Collections/Immutable/Set"
   */
  filter<A>(this: SET.Set<A>, predicate: Predicate<A>): SET.Set<A>

  /**
   * @ets_rewrite_method some_ from "@effect-ts/core/Collections/Immutable/Set"
   */
  some<A>(this: SET.Set<A>, predicate: Predicate<A>): boolean

  /**
   * @ets_rewrite_method find_ from "@effect-ts-app/fluent/_ext/Set"
   */
  find<A, B extends A>(this: SET.Set<A>, refinement: Refinement<A, B>): B | undefined
  /**
   * @ets_rewrite_method find_ from "@effect-ts-app/fluent/_ext/Set"
   */
  find<A>(this: SET.Set<A>, predicate: Predicate<A>): A | undefined

  /**
   * @ets_rewrite_method findFirst_ from "@effect-ts-app/fluent/_ext/Set"
   */
  findFirst<A, B extends A>(this: SET.Set<A>, refinement: Refinement<A, B>): Option<B>
  /**
   * @ets_rewrite_method findFirst_ from "@effect-ts-app/fluent/_ext/Set"
   */
  findFirst<A>(this: SET.Set<A>, predicate: Predicate<A>): Option<A>

  /**
   * @ets_rewrite_method findFirstMap_ from "@effect-ts-app/fluent/_ext/Set"
   */
  findFirstMap<A, B>(this: SET.Set<A>, f: (a: A) => Option<B>): Option<B>
}

interface IterableOps {
  /**
   * @ets_rewrite_method forEachParN_ from "@effect-ts-app/core/Effect"
   */
  forEachParN<R, E, A, B>(
    this: Iterable<A>,
    n: number,
    f: (a: A) => Effect<R, E, B>,
    __trace?: string
  ): Effect<R, E, Chunk<B>>

  /**
   * @ets_rewrite_method forEachPar_ from "@effect-ts-app/core/Effect"
   */
  forEachPar<R, E, A, B>(
    this: Iterable<A>,
    f: (a: A) => Effect<R, E, B>,
    __trace?: string
  ): Effect<R, E, Chunk<B>>

  /**
   * @ets_rewrite_method forEach_ from "@effect-ts-app/core/Effect"
   */
  forEachEffect<R, E, A, B>(
    this: Iterable<A>,
    f: (a: A) => Effect<R, E, B>,
    __trace?: string
  ): Effect<R, E, Chunk<B>>

  /**
   * @ets_rewrite_method collectAll from "@effect-ts-app/core/Effect"
   */
  collectAll<R, E, A>(
    this: Iterable<Effect<R, E, A>>,
    __trace?: string
  ): Effect<R, E, Chunk<A>>

  /**
   * @ets_rewrite_method forEach_ from "@effect-ts-app/core/Sync"
   */
  forEachSync<R, E, A, B>(
    this: Iterable<A>,
    f: (a: A) => Sync<R, E, B>
  ): Sync<R, E, Chunk<B>>

  /**
   * @ets_rewrite_method collectAll from "@effect-ts-app/core/Sync"
   */
  collectAllSync<R, E, A>(this: Iterable<Sync<R, E, A>>): Sync<R, E, Chunk<A>>

  /**
   * @ets_rewrite_method from from "@effect-ts-app/core/Chunk"
   */
  toChunk<A>(this: Iterable<A>): Chunk<A>
}

declare module "@effect-ts/system/Collections/Immutable/Chunk" {
  interface ChunkOps extends IterableOps {
    // TYPO FIX
    /**
     * @ets_rewrite_method concat_ from "@effect-ts-app/core/Chunk"
     */
    concat<A, A1>(this: Chunk<A>, that: Chunk<A1>): Chunk<A | A1>

    /**
     * @ets_rewrite_method filter_ from "@effect-ts-app/core/Chunk"
     */
    filter<A, S extends A>(this: Chunk<A>, f: (a: A) => a is S): Chunk<S>

    /**
     * @ets_rewrite_method filter_ from "@effect-ts-app/core/Chunk"
     */
    filter<A>(this: Chunk<A>, f: (a: A) => boolean): Chunk<A>

    /**
     * @ets_rewrite_method map_ from "@effect-ts-app/core/Chunk"
     */
    map<A, B>(this: Chunk<A>, f: (a: A) => B): Chunk<B>

    /**
     * @ets_rewrite_method collect_ from "@effect-ts-app/core/Chunk"
     */
    collect<A, B>(this: Chunk<A>, f: (a: A) => Option<B>): Chunk<B>

    /**
     * @ets_rewrite_method toArray from "@effect-ts-app/core/Chunk"
     */
    toArray<A>(this: Chunk<A>): ARR.Array<A>

    /**
     * @ets_rewrite_method find_ from "@effect-ts-app/core/Chunk"
     */
    find<A, B extends A>(this: Chunk<A>, f: Refinement<A, B>): Option<B>

    /**
     * @ets_rewrite_method find_ from "@effect-ts-app/core/Chunk"
     */
    find<A>(this: Chunk<A>, f: (a: A) => boolean): Option<A>
  }
}

declare global {
  interface ArrayOps extends AOps, IterableOps {}
  interface ReadonlyArrayOps extends AOps, IterableOps {
    // undo the global overwrite in ETS
    /**
     * @ets_rewrite_method mapOriginal_ from "@effect-ts-app/fluent/_ext/Array"
     */
    map<AX, B>(this: ARR.Array<AX>, f: (a: AX, i: number) => B): B[]
  }

  interface Set<T> extends SetOps {}
  interface ReadonlySet<T> extends ReadonlySetOps {}
  interface SetOps extends SOps, IterableOps {}
  interface ReadonlySetOps extends SOps, IterableOps {}

  // interface Iterable<T> extends IterableOps {}
  // interface IterableIterator<T> extends IterableOps {}
  // interface Generator<T, A, B> extends IterableOps {}
}

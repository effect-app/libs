/**
 * For namespace * exports to work, there must be a matching and USED `import type * as ` from the same file
 * We need to handle the real exports separately in another file (Prelude.code.ts)
 * and post build move the other file as .js counter part of this d.ts file.
 */
import type * as CTX from "effect-app/Context";
import type * as EFFECT from "effect-app/Effect";
import type * as NS from "effect-app/NonEmptySet";
import type * as SET from "effect-app/Set";
import type * as C from "effect/Cause";
import type * as CNK from "effect/Chunk";
import type * as CFG from "effect/Config";
import type * as DUR from "effect/Duration";
import type * as EITHER from "effect/Either";
import type * as EQL from "effect/Equal";
import type * as EQ from "effect/Equivalence";
import type * as EX from "effect/Exit";
import type * as FR from "effect/FiberRef";
import type * as HM from "effect/HashMap";
import type * as LAYER from "effect-app/Layer";
import type * as O from "effect/Option";
import type * as ORD from "effect/Order";
import type * as REF from "effect/Ref";
import type * as REC from "effect/Record";
import type * as SCHEMA from "effect/Schema";
import type * as SCOPE from "effect/Scope";

export type { NonEmptyArray, NonEmptyReadonlyArray } from "effect-app/Array";
export declare namespace Effect {
    export * from "effect-app/Effect";
    export type Success<T extends Effect<any, any, any>> = EFFECT.Effect.Success<T>;
    export type Error<T extends Effect<any, any, any>> = EFFECT.Effect.Error<T>;
    export type Context<T extends Effect<any, any, any>> = EFFECT.Effect.Context<T>;
}
export type Effect<out A, out E = never, out R = never> = EFFECT.Effect<A, E, R>;
export declare namespace Layer {
    export * from "effect-app/Layer";
    export type Success<T extends Layer<never, any, any>> = LAYER.Layer.Success<T>;
    export type Error<T extends Layer<never, any, any>> = LAYER.Layer.Error<T>;
    export type Context<T extends Layer<never, any, any>> = LAYER.Layer.Context<T>;
}
export type Layer<in ROut, out E = never, out RIn = never> = LAYER.Layer<ROut, E, RIn>;
export declare namespace Either {
    export * from "effect/Either";
}
export type Either<R, L = never> = EITHER.Either<R, L>;
export declare namespace Order {
    export * from "effect/Order";
}
export type Order<in A> = ORD.Order<A>;
export declare namespace Ref {
    export * from "effect/Ref";
}
export type Ref<in out A> = REF.Ref<A>;
export declare namespace Duration {
    export * from "effect/Duration";
}
export type Duration = DUR.Duration;
export declare namespace Context {
    export * from "effect-app/Context";
}
export type Context<in Services> = CTX.Context<Services>;
export declare namespace FiberRef {
    export * from "effect/FiberRef";
}
export type FiberRef<in out A> = FR.FiberRef<A>;
export declare namespace Cause {
    export * from "effect/Cause";
}
export type Cause<A> = C.Cause<A>;
export declare namespace Exit {
    export * from "effect/Exit";
}
export type Exit<A, E = never> = EX.Exit<A, E>;
export declare namespace HashMap {
    export * from "effect/HashMap";
}
export type HashMap<out Key, out Value> = HM.HashMap<Key, Value>;
export declare namespace Scope {
    export * from "effect/Scope";
}
export type Scope = SCOPE.Scope;
export declare namespace Option {
    export * from "effect/Option";
}
export type Option<A> = O.Option<A>;
export declare namespace Equivalence {
    export * from "effect/Equivalence";
}
export type Equivalence<in A> = EQ.Equivalence<A>;
export declare namespace Config {
    export * from "effect/Config";
}
export type Config<out A> = CFG.Config<A>;
export declare namespace Equal {
    export * from "effect/Equal";
}
export type Equal = EQL.Equal;
export declare namespace Chunk {
    export * from "effect/Chunk";
}
export type Chunk<out A> = CNK.Chunk<A>;
export declare namespace NonEmptySet {
    export * from "effect-app/NonEmptySet";
}
export type NonEmptySet<A> = NS.NonEmptySet<A>;
export declare namespace Record {
    export * from "effect/Record";
}
export type Record<K extends keyof any, T> = globalThis.Record<K, V>;
export declare namespace Array {
    export * from "effect-app/Array";
}
export type Array<A> = globalThis.ReadonlyArray<A>;
export declare namespace ReadonlySet {
    export * from "effect-app/Set";
}
export type ReadonlySet<A> = SET.Set<A>;
export declare namespace Schema {
    export * from "effect/Schema";
    export type Type<S> = SCHEMA.Schema.Type<S>;
    export type Encoded<S> = SCHEMA.Schema.Encoded<S>;
    export type Context<S> = SCHEMA.Schema.Context<S>;
}
export type Schema<in out A, in out I = A, out R = never> = SCHEMA.Schema<A, I, R>;
//# sourceMappingURL=Prelude.d.ts.map
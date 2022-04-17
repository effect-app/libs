/* eslint-disable import/no-duplicates */
// ets_tracing: off
import type { IO as EffectIO } from "@effect-ts/core/Effect"
import type * as O from "@effect-ts/core/Option"
import type { IO as SyncIO } from "@effect-ts/core/Sync"

declare module "@effect-ts/system/Option/core" {
  interface Ops<A> {
    /**
     * @ets_rewrite_getter toNullable from "@effect-ts/core/Option"
     */
    readonly val: A | null

    /**
     * @ets_rewrite_getter toUndefined from "@effect-ts/core/Option"
     */
    readonly value: A | undefined
  }
  export interface Some<A> extends Ops<A> {}
  export interface None extends Ops<never> {}

  export interface OptionOps {
    /**
     * @ets_rewrite_method alt_ from "@effect-ts-app/fluent/_ext/Option"
     */
    alt<A, B>(this: Option<A>, fb: () => Option<B>): Option<A | B>

    /**
     * @ets_rewrite_method tryCatchOption_ from "@effect-ts-app/core/Sync"
     */
    encaseInSync<E, A>(this: Option<A>, onNone: () => E): SyncIO<E, A>

    /**
     * @ets_rewrite_method encaseOption_ from "@effect-ts-app/core/Effect"
     */
    encaseInEffect<E, A>(this: Option<A>, onNone: () => E): EffectIO<E, A>
  }

  export interface OptionStaticOps {
    fromNullable: typeof Option.fromNullable
    isSome: typeof Option.isSome
    isNone: typeof Option.isNone
  }
  const Option: OptionStaticOps
}
//# sourceMappingURL=option.d.ts.map

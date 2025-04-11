import { Context, Effect, type Queue } from "effect-app"
import * as Q from "effect/Queue"

const make = Effect
  .gen(function*() {
    const store = yield* Effect.sync(() => new Map<string, Queue.Queue<string>>())

    return {
      getOrCreateQueue: Effect.fnUntraced(function*(k: string) {
        const q = store.get(k)
        if (q) return q
        const newQ = yield* Q.unbounded<string>()
        store.set(k, newQ)
        return newQ
      })
    }
  })

export class MemQueue extends Context.TagMakeId("effect-app/MemQueue", make)<MemQueue>() {
  static readonly Live = this.toLayer()
}

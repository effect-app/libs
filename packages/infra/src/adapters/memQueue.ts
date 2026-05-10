import * as Context from "effect-app/Context"
import * as Effect from "effect-app/Effect"
import * as Queue from "effect/Queue"

const make = Effect
  .gen(function*() {
    const store = yield* Effect.sync(() => new Map<string, Queue.Queue<string>>())

    return {
      getOrCreateQueue: Effect.fnUntraced(function*(k: string) {
        const q = store.get(k)
        if (q) return q
        const newQ = yield* Queue.unbounded<string>()
        store.set(k, newQ)
        return newQ
      })
    }
  })

export class MemQueue extends Context.Opaque<MemQueue>()("effect-app/MemQueue", { make }) {
  static readonly Live = this.toLayer(this.make)
}

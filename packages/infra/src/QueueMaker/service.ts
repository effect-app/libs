import type { Effect, NonEmptyReadonlyArray, Scope } from "effect-app"
import { RequestContext } from "../RequestContext.js"

export interface QueueBase<Evt, DrainEvt> {
  drain: <DrainE, DrainR>(
    makeHandleEvent: (ks: DrainEvt) => Effect.Effect<void, DrainE, DrainR>,
    sessionId?: string
  ) => Effect.Effect<never, never, Scope.Scope | DrainR>
  publish: (
    ...messages: NonEmptyReadonlyArray<Evt>
  ) => Effect.Effect<void>
}

export interface QueueMakerOps {}
export const QueueMaker: QueueMakerOps = {}

export const QueueMeta = RequestContext

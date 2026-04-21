import { Cause, Tracer } from "effect"
import { Effect, Fiber, flow, type NonEmptyReadonlyArray, S } from "effect-app"
import { pretty } from "effect-app/utils"
import * as Q from "effect/Queue"
import { MemQueue } from "../adapters/memQueue.js"
import { getRequestContext, setupRequestContextWithCustomSpan } from "../api/setupRequest.js"
import { InfraLogger } from "../logger.js"
import { reportNonInterruptedFailure, reportNonInterruptedFailureCause } from "./errors.js"
import { type QueueBase, QueueMeta } from "./service.js"

export const makeMemQueue = Effect.fnUntraced(function*<
  Evt extends { id: S.StringId; _tag: string },
  DrainEvt extends { id: S.StringId; _tag: string },
  EvtE,
  DrainEvtE
>(
  queueName: string,
  queueDrainName: string,
  schema: S.Codec<Evt, EvtE>,
  drainSchema: S.Codec<DrainEvt, DrainEvtE>
) {
  const mem = yield* MemQueue
  const q = yield* mem.getOrCreateQueue(queueName)
  const qDrain = yield* mem.getOrCreateQueue(queueDrainName)

  const wireSchema = S.Struct({ body: schema, meta: QueueMeta })
  const wireSchemaJson = S.fromJsonString(S.toCodecJson(wireSchema))
  const encodePublish = S.encodeEffect(wireSchemaJson)
  const drainW = S.Struct({ body: drainSchema, meta: QueueMeta })
  const drainWJson = S.fromJsonString(S.toCodecJson(drainW))

  const parseDrain = flow(S.decodeUnknownEffect(drainWJson), Effect.orDie)

  const queue = {
    publish: Effect.fn("queue.publish: " + queueName, { kind: "producer" })(function*(
      ...messages: NonEmptyReadonlyArray<Evt>
    ) {
      yield* Effect.annotateCurrentSpan({ "message_tags": messages.map((_) => _._tag) })
      const requestContext = yield* getRequestContext
      // we JSON encode, because that is what the wire also does, and it reveals holes in e.g unknown encoders (Date->String)
      yield* Effect.forEach(
        messages,
        (m) =>
          encodePublish({ body: m, meta: requestContext }).pipe(
            Effect.orDie,
            Effect.flatMap((_) => Q.offer(q, _))
          ),
        { discard: true }
      )
    }),
    drain: <DrainE, DrainR>(
      handleEvent: (ks: DrainEvt) => Effect.Effect<void, DrainE, DrainR>,
      sessionId?: string
    ) => {
      const silenceAndReportError = reportNonInterruptedFailure({ name: "MemQueue.drain." + queueDrainName })
      const reportError = reportNonInterruptedFailureCause({ name: "MemQueue.drain." + queueDrainName })
      const processMessage = Effect.fnUntraced(function*(msg: string) {
        // we JSON parse, because that is what the wire also does, and it reveals holes in e.g unknown encoders (Date->String)
        const { body, meta } = yield* parseDrain(msg).pipe(Effect.orDie)
        let effect = InfraLogger
          .logDebug(`[${queueDrainName}] Processing incoming message`)
          .pipe(
            Effect.annotateLogs({ body: pretty(body), meta: pretty(meta) }),
            Effect.andThen(handleEvent(body)),
            silenceAndReportError,
            (_) =>
              setupRequestContextWithCustomSpan(
                _,
                meta,
                `queue.drain: ${queueDrainName}.${body._tag}`,
                {
                  captureStackTrace: false,
                  kind: "consumer",
                  attributes: {
                    "queue.name": queueDrainName,
                    "queue.sessionId": sessionId,
                    "queue.input": body
                  }
                }
              )
          )
        if (meta.span) {
          effect = Effect.withParentSpan(effect, Tracer.externalSpan(meta.span))
        }
        return yield* effect
      })
      return Effect.fn(`queue.drain: ${queueDrainName}`, {
        attributes: { "queue.type": "mem", "queue.name": queueDrainName, "queue.sessionId": sessionId }
      })(function*() {
        const x = yield* Q.take(qDrain)
        const exit = yield* processMessage(x).pipe(
          Effect.uninterruptible,
          Effect.forkChild,
          Effect.flatMap(Fiber.join)
        )
        if (exit._tag === "Failure" && !Cause.hasInterruptsOnly(exit.cause)) {
          // normally a failed item would be returned to the queue and retried up to X times.
          yield* Q.offer(qDrain, x).pipe(
            // TODO: retry count tracking and max retries.
            Effect.delay("5 seconds"),
            Effect.tapCause(reportError),
            Effect.forkDetach
          )
        }
      }, (effect) => effect.pipe(silenceAndReportError, Effect.forever))()
    }
  }
  return queue as QueueBase<Evt, DrainEvt>
})

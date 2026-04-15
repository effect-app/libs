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
    publish: (...messages: NonEmptyReadonlyArray<Evt>) =>
      getRequestContext
        .pipe(
          Effect.flatMap((requestContext) =>
            Effect
              .forEach(messages, (m) =>
                // we JSON encode, because that is what the wire also does, and it reveals holes in e.g unknown encoders (Date->String)
                encodePublish({ body: m, meta: requestContext }).pipe(
                  Effect.orDie,
                  // .tap((msg) => info("Publishing Mem Message: " + utils.inspect(msg)))
                  Effect.flatMap((_) => Q.offer(q, _))
                ), { discard: true })
          ),
          Effect.withSpan("queue.publish: " + queueName, {
            kind: "producer",
            attributes: { "message_tags": messages.map((_) => _._tag) }
          }, { captureStackTrace: false })
        ),
    drain: <DrainE, DrainR>(
      handleEvent: (ks: DrainEvt) => Effect.Effect<void, DrainE, DrainR>,
      sessionId?: string
    ) => {
      const silenceAndReportError = reportNonInterruptedFailure({ name: "MemQueue.drain." + queueDrainName })
      const reportError = reportNonInterruptedFailureCause({ name: "MemQueue.drain." + queueDrainName })
      const processMessage = (msg: string) =>
        // we JSON parse, because that is what the wire also does, and it reveals holes in e.g unknown encoders (Date->String)
        parseDrain(msg).pipe(
          Effect.orDie,
          Effect
            .flatMap(({ body, meta }) => {
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
              return effect
            })
        )
      return Q
        .take(qDrain)
        .pipe(
          Effect
            .flatMap((x) =>
              processMessage(x).pipe(
                Effect.uninterruptible,
                Effect.forkChild,
                Effect.flatMap(Fiber.join),
                // normally a failed item would be returned to the queue and retried up to X times.
                Effect.flatMap((_) =>
                  _._tag === "Failure" && !Cause.hasInterruptsOnly(_.cause)
                    ? Q.offer(qDrain, x).pipe(
                      // TODO: retry count tracking and max retries.
                      Effect.delay("5 seconds"),
                      Effect.tapCause(reportError),
                      Effect.forkDetach
                    )
                    : Effect.void
                )
              )
            ),
          silenceAndReportError,
          Effect.withSpan(`queue.drain: ${queueDrainName}`, {
            attributes: {
              "queue.type": "mem",
              "queue.name": queueDrainName,
              "queue.sessionId": sessionId
            }
          }),
          Effect.forever
        )
    }
  }
  return queue as QueueBase<Evt, DrainEvt>
})

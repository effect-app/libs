import { Tracer } from "effect"
import { Effect, Fiber, flow, S } from "effect-app"
import { pretty } from "effect-app/utils"
import { MemQueue } from "../adapters/memQueue.js"
import { getRequestContext, setupRequestContext } from "../api/setupRequest.js"
import { InfraLogger } from "../logger.js"
import { reportNonInterruptedFailure } from "./errors.js"
import { type QueueBase, QueueMeta } from "./service.js"

export function makeMemQueue<
  Evt extends { id: S.StringId; _tag: string },
  DrainEvt extends { id: S.StringId; _tag: string },
  EvtE,
  DrainEvtE
>(
  queueName: string,
  queueDrainName: string,
  schema: S.Schema<Evt, EvtE>,
  drainSchema: S.Schema<DrainEvt, DrainEvtE>
) {
  return Effect.gen(function*() {
    const mem = yield* MemQueue
    const q = yield* mem.getOrCreateQueue(queueName)
    const qDrain = yield* mem.getOrCreateQueue(queueDrainName)

    const wireSchema = S.Struct({ body: schema, meta: QueueMeta })
    const drainW = S.Struct({ body: drainSchema, meta: QueueMeta })
    const parseDrain = flow(S.decodeUnknown(drainW), Effect.orDie)

    return {
      publish: (...messages) =>
        Effect
          .gen(function*() {
            const requestContext = yield* getRequestContext
            return yield* Effect
              .forEach(messages, (m) =>
                // we JSON encode, because that is what the wire also does, and it reveals holes in e.g unknown encoders (Date->String)
                S.encode(wireSchema)({ body: m, meta: requestContext }).pipe(
                  Effect.orDie,
                  Effect
                    .andThen(JSON.stringify),
                  // .tap((msg) => info("Publishing Mem Message: " + utils.inspect(msg)))
                  Effect.flatMap((_) => q.offer(_))
                ), { discard: true })
          })
          .pipe(
            Effect.withSpan("queue.publish: " + queueName, {
              captureStackTrace: false,
              kind: "producer",
              attributes: { "message_tags": messages.map((_) => _._tag) }
            })
          ),
      drain: <DrainE, DrainR>(
        handleEvent: (ks: DrainEvt) => Effect<void, DrainE, DrainR>,
        sessionId?: string
      ) =>
        Effect.gen(function*() {
          const silenceAndReportError = reportNonInterruptedFailure({ name: "MemQueue.drain." + queueDrainName })
          const processMessage = (msg: string) =>
            // we JSON parse, because that is what the wire also does, and it reveals holes in e.g unknown encoders (Date->String)
            Effect
              .sync(() => JSON.parse(msg))
              .pipe(
                Effect.flatMap(parseDrain),
                Effect.orDie,
                Effect
                  .flatMap(({ body, meta }) => {
                    let effect = InfraLogger
                      .logInfo(`[${queueDrainName}] Processing incoming message`)
                      .pipe(
                        Effect.annotateLogs({ body: pretty(body), meta: pretty(meta) }),
                        Effect.zipRight(handleEvent(body)),
                        silenceAndReportError,
                        (_) =>
                          setupRequestContext(
                            _,
                            meta
                          ),
                        Effect
                          .withSpan(`queue.drain: ${queueDrainName}.${body._tag}`, {
                            captureStackTrace: false,
                            kind: "consumer",
                            attributes: {
                              "queue.name": queueDrainName,
                              "queue.sessionId": sessionId,
                              "queue.input": body
                            }
                          })
                      )
                    if (meta.span) {
                      effect = Effect.withParentSpan(effect, Tracer.externalSpan(meta.span))
                    }
                    return effect
                  })
              )
          return yield* qDrain
            .take
            .pipe(
              Effect.flatMap((x) =>
                processMessage(x).pipe(Effect.uninterruptible, Effect.fork, Effect.flatMap(Fiber.join))
              ),
              // TODO: normally a failed item would be returned to the queue and retried up to X times.
              // .flatMap(_ => _._tag === "Failure" && !isInterrupted ? qDrain.offer(x) : Effect.unit) // TODO: retry count tracking and max retries.
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
        })
    } satisfies QueueBase<Evt, DrainEvt>
  })
}

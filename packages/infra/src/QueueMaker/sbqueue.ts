import { Tracer } from "effect"
import { Cause, Effect, flow, S } from "effect-app"
import type { StringId } from "effect-app/Schema"
import { pretty } from "effect-app/utils"
import { Receiver, Sender } from "../adapters/ServiceBus.js"
import { getRequestContext, setupRequestContextWithCustomSpan } from "../api/setupRequest.js"
import { InfraLogger } from "../logger.js"
import { reportNonInterruptedFailure, reportNonInterruptedFailureCause, reportQueueError } from "./errors.js"
import { type QueueBase, QueueMeta } from "./service.js"

export function makeServiceBusQueue<
  Evt extends { id: StringId; _tag: string },
  DrainEvt extends { id: StringId; _tag: string },
  EvtE,
  DrainEvtE
>(
  schema: S.Schema<Evt, EvtE>,
  drainSchema: S.Schema<DrainEvt, DrainEvtE>
) {
  const wireSchema = S.Struct({
    body: schema,
    meta: QueueMeta
  })
  const drainW = S.Struct({ body: drainSchema, meta: QueueMeta })
  const parseDrain = flow(S.decodeUnknown(drainW), Effect.orDie)

  return Effect.gen(function*() {
    const sender = yield* Sender
    const receiver = yield* Receiver
    const silenceAndReportError = reportNonInterruptedFailure({ name: receiver.name })
    const reportError = reportNonInterruptedFailureCause({ name: receiver.name })

    // TODO: or do async?
    // This will make sure that the host receives the error (MainFiberSet.join), who will then interrupt everything and commence a shutdown and restart of app
    // const deferred = yield* Deferred.make<never, ServiceBusError | Error>()

    return {
      drain: <DrainE, DrainR>(
        handleEvent: (ks: DrainEvt) => Effect.Effect<void, DrainE, DrainR>,
        sessionId?: string
      ) =>
        Effect
          .gen(function*() {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            function processMessage(messageBody: any) {
              return Effect
                .sync(() => JSON.parse(messageBody))
                .pipe(
                  Effect.flatMap((x) => parseDrain(x)),
                  Effect.orDie,
                  Effect
                    .flatMap(({ body, meta }) => {
                      let effect = InfraLogger
                        .logDebug(`[${receiver.name}] Processing incoming message`)
                        .pipe(
                          Effect.annotateLogs({
                            body: pretty(body),
                            meta: pretty(meta)
                          }),
                          Effect.zipRight(handleEvent(body)),
                          Effect.orDie
                        )
                        // we silenceAndReportError here, so that the error is reported, and moves into the Exit.
                        .pipe(
                          silenceAndReportError,
                          (_) =>
                            setupRequestContextWithCustomSpan(
                              _,
                              meta,
                              `queue.drain: ${receiver.name}${sessionId ? `#${sessionId}` : ""}.${body._tag}`,
                              {
                                captureStackTrace: false,
                                kind: "consumer",
                                attributes: {
                                  "queue.name": receiver.name,
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
                    }),
                  Effect
                    // we reportError here, so that we report the error only, and keep flowing
                    .tapErrorCause(reportError),
                  // we still need to flatten the Exit.
                  Effect.flatMap((_) => _)
                )
            }

            return yield* receiver
              .subscribe({
                processMessage: (x) => processMessage(x.body).pipe(Effect.uninterruptible),
                processError: (err) => reportQueueError(Cause.fail(err.error))
                // Deferred.completeWith(
                //   deferred,
                //   reportFatalQueueError(Cause.fail(err.error))
                //     .pipe(Effect.andThen(Effect.fail(err.error)))
                // )
              }, sessionId)
          })
          // .pipe(Effect.andThen(Deferred.await(deferred).pipe(Effect.orDie))),
          .pipe(
            Effect.andThen(Effect.never)
          ),

      publish: (...messages) =>
        Effect
          .gen(function*() {
            const requestContext = yield* getRequestContext
            return yield* sender.sendMessages(
              messages.map((m) => ({
                body: JSON.stringify(
                  S.encodeSync(wireSchema)({
                    body: m,
                    meta: requestContext
                  })
                ),
                messageId: m.id, /* correllationid: requestId */
                contentType: "application/json",
                sessionId: "sessionId" in m ? m.sessionId as string : undefined as unknown as string // TODO: optional
              }))
            )
          })
          .pipe(Effect.withSpan("queue.publish: " + sender.name, {
            captureStackTrace: false,
            kind: "producer",
            attributes: { "message_tags": messages.map((_) => _._tag) }
          }))
    } satisfies QueueBase<Evt, DrainEvt>
  })
}

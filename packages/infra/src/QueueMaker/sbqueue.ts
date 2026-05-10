import { flow } from "effect"
import type { NonEmptyReadonlyArray } from "effect-app/Array"
import * as Effect from "effect-app/Effect"
import * as S from "effect-app/Schema"
import type { StringId } from "effect-app/Schema"
import { pretty } from "effect-app/utils"
import * as Cause from "effect/Cause"
import * as Tracer from "effect/Tracer"
import { Receiver, Sender } from "../adapters/ServiceBus.js"
import { getRequestContext, setupRequestContextWithCustomSpan } from "../api/setupRequest.js"
import { InfraLogger } from "../logger.js"
import { messagingSpanArgs } from "../otel.js"
import { reportNonInterruptedFailure, reportNonInterruptedFailureCause, reportQueueError } from "./errors.js"
import { QueueMeta } from "./service.js"

export function makeServiceBusQueue<
  Evt extends { id: StringId; _tag: string },
  DrainEvt extends { id: StringId; _tag: string },
  EvtE,
  DrainEvtE
>(
  schema: S.Codec<Evt, EvtE>,
  drainSchema: S.Codec<DrainEvt, DrainEvtE>
) {
  const wireSchema = S.Struct({
    body: schema,
    meta: QueueMeta
  })
  const wireSchemaJson = S.fromJsonString(S.toCodecJson(wireSchema))
  const encodePublish = S.encodeEffect(wireSchemaJson)
  const drainW = S.Struct({ body: drainSchema, meta: QueueMeta })
  const drainWJson = S.fromJsonString(S.toCodecJson(drainW))
  const parseDrain = flow(S.decodeUnknownEffectConcurrently(drainWJson), Effect.orDie)

  return Effect.gen(function*() {
    const sender = yield* Sender
    const receiver = yield* Receiver
    const silenceAndReportError = reportNonInterruptedFailure({ name: receiver.name })
    const reportError = reportNonInterruptedFailureCause({ name: receiver.name })

    // TODO: or do async?
    // This will make sure that the host receives the error (MainFiberSet.join), who will then interrupt everything and commence a shutdown and restart of app
    // const deferred = yield* Deferred.make<never, ServiceBusError | Error>()

    const queue = {
      drain: <DrainE, DrainR>(
        handleEvent: (ks: DrainEvt) => Effect.Effect<void, DrainE, DrainR>,
        sessionId?: string
      ) => {
        const processMessage = Effect.fnUntraced(function*(messageBody: unknown) {
          const { body, meta } = yield* parseDrain(messageBody).pipe(Effect.orDie)
          let effect = InfraLogger
            .logDebug(`[${receiver.name}] Processing incoming message`)
            .pipe(
              Effect.annotateLogs({ body: pretty(body), meta: pretty(meta) }),
              Effect.andThen(handleEvent(body)),
              Effect.orDie,
              // we silenceAndReportError here, so that the error is reported, and moves into the Exit.
              silenceAndReportError,
              (_) => {
                const args = messagingSpanArgs({
                  operation: "process",
                  system: "servicebus",
                  destination: receiver.name,
                  messageId: body.id,
                  conversationId: sessionId,
                  extra: { "messaging.message.type": body._tag, "messaging.message.body": body }
                }, "consumer")
                return setupRequestContextWithCustomSpan(
                  _,
                  meta,
                  args.name,
                  {
                    captureStackTrace: false,
                    kind: args.kind,
                    attributes: args.attributes
                  }
                )
              }
            )
          if (meta.span) {
            effect = Effect.withParentSpan(effect, Tracer.externalSpan(meta.span))
          }
          // we reportError here, so that we report the error only, and keep flowing
          const exit = yield* Effect.tapCause(effect, reportError)
          return yield* exit
        })

        return receiver
          .subscribe({
            processMessage: (x) => processMessage(x.body).pipe(Effect.uninterruptible),
            processError: (err) => reportQueueError(Cause.fail(err.error))
          }, sessionId)
          .pipe(Effect.andThen(Effect.never))
      },

      publish: Effect.fn(`publish ${sender.name}`, {
        kind: "producer",
        attributes: {
          "messaging.system": "servicebus",
          "messaging.operation.name": "publish",
          "messaging.destination.name": sender.name
        }
      })(function*(...messages: NonEmptyReadonlyArray<Evt>) {
        yield* Effect.annotateCurrentSpan({
          "messaging.batch.message_count": messages.length,
          "messaging.message.types": messages.map((_) => _._tag)
        })
        const requestContext = yield* getRequestContext
        const msgs = yield* Effect.forEach(messages, (m) =>
          encodePublish({ body: m, meta: requestContext }).pipe(
            Effect.orDie,
            Effect.map((body) => ({
              body,
              messageId: m.id, /* correllationid: requestId */
              contentType: "application/json",
              sessionId: "sessionId" in m ? m.sessionId as string : undefined as unknown as string // TODO: optional
            }))
          ))
        yield* sender.sendMessages(msgs)
      })
    }
    return queue
  })
}

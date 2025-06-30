import { getRequestContext, setupRequestContextWithCustomSpan } from "@effect-app/infra/api/setupRequest"
import { reportNonInterruptedFailure } from "@effect-app/infra/QueueMaker/errors"
import { type QueueBase, QueueMeta } from "@effect-app/infra/QueueMaker/service"
import { SqlClient } from "@effect/sql"
import { subMinutes } from "date-fns"
import { Effect, Fiber, Option, S, Tracer } from "effect-app"
import type { NonEmptyString255 } from "effect-app/Schema"
import { pretty } from "effect-app/utils"
import { SQLModel } from "../adapters/SQL.js"
import { InfraLogger } from "../logger.js"

export const QueueId = S.Number.pipe(S.brand("QueueId"))
export type QueueId = typeof QueueId.Type

// TODO: let the model track and Auto Generate versionColumn on every update instead
export function makeSQLQueue<
  Evt extends { id: S.StringId; _tag: string },
  DrainEvt extends { id: S.StringId; _tag: string },
  EvtE,
  DrainEvtE
>(
  queueName: NonEmptyString255,
  queueDrainName: NonEmptyString255,
  schema: S.Schema<Evt, EvtE>,
  drainSchema: S.Schema<DrainEvt, DrainEvtE>
) {
  return Effect.gen(function*() {
    const base = {
      id: SQLModel.Generated(QueueId),
      meta: SQLModel.JsonFromString(QueueMeta),
      name: S.NonEmptyString255,
      createdAt: SQLModel.DateTimeInsert,
      updatedAt: SQLModel.DateTimeUpdate,
      // TODO: at+owner
      processingAt: SQLModel.FieldOption(S.Date),
      finishedAt: SQLModel.FieldOption(S.Date),
      etag: S.String // TODO: use a SQLModel thing that auto updates it?
      // TODO: record locking.. / optimistic locking
      // rowVersion: SQLModel.DateTimeFromNumberWithNow
    }
    class Queue extends SQLModel.Class<Queue>("Queue")({
      body: SQLModel.JsonFromString(schema),
      ...base
    }) {}
    class Drain extends SQLModel.Class<Drain>("Drain")({
      body: SQLModel.JsonFromString(drainSchema),
      ...base
    }) {}
    const sql = yield* SqlClient.SqlClient

    const queueRepo = yield* SQLModel.makeRepository(Queue, {
      tableName: "queue",
      spanPrefix: "QueueRepo",
      idColumn: "id",
      versionColumn: "etag"
    })

    const drainRepo = yield* SQLModel.makeRepository(Drain, {
      tableName: "queue",
      spanPrefix: "DrainRepo",
      idColumn: "id",
      versionColumn: "etag"
    })

    const decodeDrain = S.decode(Drain)

    const drain = Effect
      .sync(() => subMinutes(new Date(), 15))
      .pipe(
        Effect
          .andThen((limit) =>
            sql<typeof Drain.Encoded>`SELECT *
    FROM queue
    WHERE name = ${queueDrainName} AND finishedAt IS NULL AND (processingAt IS NULL OR processingAt < ${limit.getTime()})
    LIMIT 1`
          )
      )

    const q = {
      offer: Effect.fnUntraced(function*(body: Evt, meta: typeof QueueMeta.Type) {
        yield* queueRepo.insertVoid(
          Queue.insert.make({
            body,
            meta,
            name: queueName,
            processingAt: Option.none(),
            finishedAt: Option.none(),
            etag: crypto.randomUUID()
          })
        )
      }),
      take: Effect.gen(function*() {
        while (true) {
          const [first] = yield* drain.pipe(Effect.withTracerEnabled(false)) // disable sql tracer otherwise we spam it..
          if (first) {
            const dec = yield* decodeDrain(first)
            const { createdAt, updatedAt, ...rest } = dec
            return yield* drainRepo.update(
              Drain.update.make({ ...rest, processingAt: Option.some(new Date()) }) // auto in lib , etag: crypto.randomUUID()
            )
          }
          if (first) return first
          yield* Effect.sleep(250)
        }
      }),
      finish: ({ createdAt, updatedAt, ...q }: Drain) =>
        drainRepo.updateVoid(Drain.update.make({ ...q, finishedAt: Option.some(new Date()) })) // auto in lib , etag: crypto.randomUUID()
    }
    return {
      publish: (...messages) =>
        Effect
          .gen(function*() {
            const requestContext = yield* getRequestContext
            return yield* Effect
              .forEach(
                messages,
                (m) => q.offer(m, requestContext),
                {
                  discard: true
                }
              )
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
          const processMessage = (msg: Drain) =>
            Effect
              .succeed(msg)
              .pipe(Effect
                .flatMap(({ body, meta }) => {
                  let effect = InfraLogger
                    .logDebug(`[${queueDrainName}] Processing incoming message`)
                    .pipe(
                      Effect.annotateLogs({ body: pretty(body), meta: pretty(meta) }),
                      Effect.zipRight(handleEvent(body)),
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
                }))

          return yield* q
            .take
            .pipe(
              Effect.flatMap((x) =>
                processMessage(x).pipe(
                  Effect.uninterruptible,
                  Effect.fork,
                  Effect.flatMap(Fiber.join),
                  Effect.tap(q.finish(x))
                )
              ),
              silenceAndReportError,
              Effect.withSpan(`queue.drain: ${queueDrainName}`, {
                attributes: {
                  "queue.type": "sql",
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

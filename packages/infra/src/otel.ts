/**
 * OpenTelemetry semantic-convention helpers for span attributes.
 *
 * Aligns repository / queue / cache adapters with stable OTel semconv keys so
 * downstream collectors and dashboards work without per-adapter mappings.
 *
 * - Database: https://opentelemetry.io/docs/specs/semconv/database/
 * - Messaging: https://opentelemetry.io/docs/specs/semconv/messaging/
 * - Cosmos DB:  https://opentelemetry.io/docs/specs/semconv/database/cosmosdb/
 */

import * as Effect from "effect-app/Effect"

export type DbSystem =
  | "postgresql"
  | "sqlite"
  | "cosmosdb"
  | "mongodb"
  | "redis"
  | "other_sql"
  | "memory"
  | "disk"

export interface DbSpanOptions {
  /** OTel `db.operation.name` (e.g. `find`, `all`, `filter`, `set`). */
  readonly operation: string
  readonly system: DbSystem
  /** Logical collection / table / container name. */
  readonly collection: string
  /** Tenant / namespace / database name. */
  readonly namespace?: string | undefined
  /** Application-level entity / model name (custom: `app.entity`). */
  readonly entity?: string | undefined
  /** Sanitized / parameterized query text. Never include bound values. */
  readonly query?: string | undefined
  /** Optional fragments merged into final attributes (e.g. id, partition). */
  readonly extra?: Record<string, unknown> | undefined
}

const dbAttributes = (a: DbSpanOptions): Record<string, unknown> => ({
  "db.system.name": a.system,
  "db.operation.name": a.operation,
  "db.collection.name": a.collection,
  ...(a.namespace !== undefined && { "db.namespace": a.namespace }),
  ...(a.query !== undefined && { "db.query.text": a.query }),
  ...(a.entity !== undefined && { "app.entity": a.entity }),
  ...a.extra
})

/**
 * Wrap an effect with an OTel-semconv database span.
 *
 * Span name follows the low-cardinality convention: `<operation> <collection>`.
 */
export const withDbSpan = (a: DbSpanOptions) =>
  Effect.withSpan(
    `${a.operation} ${a.collection}`,
    { attributes: dbAttributes(a), kind: "client" as const },
    { captureStackTrace: false }
  )

/**
 * Annotate the current span with OTel-semconv database attributes.
 *
 * Use when the caller already owns the span (e.g. a repository) and the
 * adapter should only contribute db.* semconv attrs without opening a child.
 * Annotates before running so attrs persist even on failure.
 * No-op if there is no current span.
 */
export const annotateDb = (a: DbSpanOptions) => <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.flatMap(Effect.annotateCurrentSpan(dbAttributes(a)), () => self)

/** Annotate the current span with response metrics from a DB call. */
export const annotateDbResponse = (m: {
  readonly returnedRows?: number | undefined
  readonly responseBytes?: number | undefined
}) =>
  Effect.annotateCurrentSpan({
    ...(m.returnedRows !== undefined && { "db.response.returned_rows": m.returnedRows }),
    ...(m.responseBytes !== undefined && { "db.response.body.size": m.responseBytes })
  })

/** Cosmos-specific response annotations. */
export const annotateCosmosResponse = (m: {
  readonly requestCharge?: number | undefined
  readonly returnedRows?: number | undefined
  readonly responseBytes?: number | undefined
  readonly statusCode?: number | undefined
}) =>
  Effect.annotateCurrentSpan({
    ...(m.requestCharge !== undefined && { "azure.cosmosdb.operation.request_charge": m.requestCharge }),
    ...(m.statusCode !== undefined && { "db.response.status_code": String(m.statusCode) }),
    ...(m.returnedRows !== undefined && { "db.response.returned_rows": m.returnedRows }),
    ...(m.responseBytes !== undefined && { "db.response.body.size": m.responseBytes })
  })

export type MessagingSystem =
  | "servicebus"
  | "rabbitmq"
  | "kafka"
  | "memory"
  | "sql"

export type MessagingOperation =
  | "publish"
  | "create"
  | "receive"
  | "process"
  | "settle"

export interface MessagingSpanOptions {
  readonly operation: MessagingOperation
  readonly system: MessagingSystem
  /** Queue / topic name. */
  readonly destination: string
  readonly messageId?: string | undefined
  readonly conversationId?: string | undefined
  readonly bodySize?: number | undefined
  readonly extra?: Record<string, unknown> | undefined
}

const messagingAttributes = (a: MessagingSpanOptions): Record<string, unknown> => ({
  "messaging.system": a.system,
  "messaging.operation.name": a.operation,
  "messaging.destination.name": a.destination,
  ...(a.messageId !== undefined && { "messaging.message.id": a.messageId }),
  ...(a.conversationId !== undefined && { "messaging.message.conversation_id": a.conversationId }),
  ...(a.bodySize !== undefined && { "messaging.message.body.size": a.bodySize }),
  ...a.extra
})

/** Wrap an effect with an OTel-semconv messaging span. */
export const withMessagingSpan = (
  a: MessagingSpanOptions,
  kind: "producer" | "consumer"
) =>
  Effect.withSpan(
    `${a.operation} ${a.destination}`,
    { kind, attributes: messagingAttributes(a) },
    { captureStackTrace: false }
  )

/** Build messaging span options without wrapping (for Effect.fn / setupRequestContextWithCustomSpan). */
export const messagingSpanArgs = (
  a: MessagingSpanOptions,
  kind: "producer" | "consumer"
) =>
  ({
    name: `${a.operation} ${a.destination}`,
    kind,
    attributes: messagingAttributes(a)
  }) as const

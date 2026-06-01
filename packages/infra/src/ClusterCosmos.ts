import type { OperationInput, PatchRequestBody } from "@azure/cosmos"
import * as Arr from "effect-app/Array"
import * as Effect from "effect-app/Effect"
import * as Layer from "effect-app/Layer"
import * as Option from "effect-app/Option"
import * as Cause from "effect/Cause"
import * as Duration from "effect/Duration"
import * as Redacted from "effect/Redacted"
import { PersistenceError } from "effect/unstable/cluster/ClusterError"
import type * as Envelope from "effect/unstable/cluster/Envelope"
import * as MessageStorage from "effect/unstable/cluster/MessageStorage"
import { SaveResultEncoded } from "effect/unstable/cluster/MessageStorage"
import type * as Reply from "effect/unstable/cluster/Reply"
import * as RunnerStorage from "effect/unstable/cluster/RunnerStorage"
import * as ShardId from "effect/unstable/cluster/ShardId"
import * as ShardingConfig from "effect/unstable/cluster/ShardingConfig"
import * as Snowflake from "effect/unstable/cluster/Snowflake"
import { CosmosClient, CosmosClientLayer } from "./cosmos-client.js"
import { annotateCosmosResponse, annotateDb } from "./otel.js"

export interface ClusterCosmosConfig {
  readonly url: Redacted.Redacted<string>
  readonly dbName: string
  readonly prefix?: string
}

type MessageKind = "Request" | "AckChunk" | "Interrupt"
type CosmosQueryValue = string | number | boolean | null | Array<string | number | boolean | null>
type CosmosParameter = { readonly name: string; readonly value: CosmosQueryValue }

interface MessageDoc {
  readonly id: string
  readonly _partitionKey: string
  readonly type: "message"
  readonly rowid: string
  readonly messageId: string | null
  readonly shardId: string
  readonly entityType: string
  readonly entityId: string
  readonly kind: MessageKind
  readonly tag: string | null
  readonly payload: unknown
  readonly headers: Record<string, string> | null
  readonly traceId?: string | undefined
  readonly spanId?: string | undefined
  readonly sampled?: boolean | undefined
  processed: boolean
  readonly requestId: string
  readonly replyId: string | null
  lastReplyId: string | null
  lastRead: number | null
  readonly deliverAt: number | null
  readonly _etag?: string
}

type ReplyDoc = WithExitReplyDoc | ChunkReplyDoc

interface ReplyDocBase {
  readonly id: string
  readonly _partitionKey: string
  readonly type: "reply"
  readonly rowid: string
  readonly requestId: string
  acked: boolean
}

interface WithExitReplyDoc extends ReplyDocBase {
  readonly kind: "WithExit"
  readonly payload: Reply.WithExitEncoded["exit"]
  readonly sequence: null
}

interface ChunkReplyDoc extends ReplyDocBase {
  readonly kind: "Chunk"
  readonly payload: Reply.ChunkEncoded["values"]
  readonly sequence: number
}

interface RunnerDoc {
  readonly id: string
  readonly _partitionKey: "runner"
  readonly type: "runner"
  readonly address: string
  runner: string
  healthy: boolean
  lastHeartbeat: number
  readonly _etag?: string
}

interface LockDoc {
  readonly id: string
  readonly _partitionKey: "lock"
  readonly type: "lock"
  readonly shardId: string
  address: string
  acquiredAt: number
  readonly _etag?: string
}

const withTracerDisabled = Effect.withTracerEnabled(false)
const refailPersistence = <A, E, R>(effect: Effect.Effect<A, E, R>) => PersistenceError.refail(effect)
const cosmosId = (id: string) => encodeURIComponent(id)
const messagePartition = (shardId: string) => `message::${shardId}`
const messageDocId = (envelope: Envelope.Encoded, primaryKey: string | null) =>
  cosmosId(primaryKey === null ? envelopeId(envelope) : `primary::${primaryKey}`)
const replyPartition = (requestId: string) => `reply::${requestId}`
const runnerDocId = (address: string) => cosmosId(`runner::${address}`)
const lockDocId = (shardId: string) => cosmosId(`lock::${shardId}`)
const tenMinutes = Duration.toMillis(Duration.minutes(10))
const maxCosmosBatchOperations = 100
const isSuccessfulStatus = (statusCode: number | undefined): boolean =>
  statusCode !== undefined && statusCode >= 200 && statusCode < 300

const isCosmosStatus = (u: unknown, code: number): boolean =>
  Cause.isUnknownError(u)
    ? isCosmosStatus(u.cause, code)
    : typeof u === "object" && u !== null && "code" in u && u.code === code

const isConflict = (u: unknown) => isCosmosStatus(u, 409)
const isNotFound = (u: unknown) => isCosmosStatus(u, 404)
const isPreconditionFailed = (u: unknown) => isCosmosStatus(u, 412)

const respBytes = (
  resp: { diagnostics?: { clientSideRequestStatistics?: { totalResponsePayloadLengthInBytes?: number } } }
) => resp.diagnostics?.clientSideRequestStatistics?.totalResponsePayloadLengthInBytes ?? 0

const annotateItem = (resp: {
  readonly requestCharge?: number
  readonly statusCode?: number
  readonly diagnostics?: {
    readonly clientSideRequestStatistics?: { readonly totalResponsePayloadLengthInBytes?: number }
  }
}) =>
  annotateCosmosResponse({
    requestCharge: resp.requestCharge,
    statusCode: resp.statusCode,
    responseBytes: respBytes(resp)
  })

const annotateFeed = (resp: {
  readonly resources: readonly unknown[]
  readonly requestCharge?: number
  readonly diagnostics?: {
    readonly clientSideRequestStatistics?: { readonly totalResponsePayloadLengthInBytes?: number }
  }
}) =>
  annotateCosmosResponse({
    requestCharge: resp.requestCharge,
    returnedRows: resp.resources.length,
    responseBytes: respBytes(resp)
  })

const envelopeId = (envelope: Envelope.Encoded) => envelope._tag === "Request" ? envelope.requestId : envelope.id

const envelopeToDoc = (
  envelope: Envelope.Encoded,
  primaryKey: string | null,
  deliverAt: number | null
): MessageDoc => {
  switch (envelope._tag) {
    case "Request":
      return {
        id: messageDocId(envelope, primaryKey),
        _partitionKey: messagePartition(ShardId.toString(envelope.address.shardId)),
        type: "message",
        rowid: envelope.requestId,
        messageId: primaryKey,
        shardId: ShardId.toString(envelope.address.shardId),
        entityType: envelope.address.entityType,
        entityId: envelope.address.entityId,
        kind: "Request",
        tag: envelope.tag,
        payload: envelope.payload,
        headers: envelope.headers,
        traceId: envelope.traceId,
        spanId: envelope.spanId,
        sampled: envelope.sampled,
        processed: false,
        requestId: envelope.requestId,
        replyId: null,
        lastReplyId: null,
        lastRead: null,
        deliverAt
      }
    case "AckChunk":
      return {
        id: cosmosId(envelope.id),
        _partitionKey: messagePartition(ShardId.toString(envelope.address.shardId)),
        type: "message",
        rowid: envelope.id,
        messageId: primaryKey,
        shardId: ShardId.toString(envelope.address.shardId),
        entityType: envelope.address.entityType,
        entityId: envelope.address.entityId,
        kind: "AckChunk",
        tag: null,
        payload: null,
        headers: null,
        processed: false,
        requestId: envelope.requestId,
        replyId: envelope.replyId,
        lastReplyId: null,
        lastRead: null,
        deliverAt
      }
    case "Interrupt":
      return {
        id: cosmosId(envelope.id),
        _partitionKey: messagePartition(ShardId.toString(envelope.address.shardId)),
        type: "message",
        rowid: envelope.id,
        messageId: primaryKey,
        shardId: ShardId.toString(envelope.address.shardId),
        entityType: envelope.address.entityType,
        entityId: envelope.address.entityId,
        kind: "Interrupt",
        tag: null,
        payload: null,
        headers: null,
        processed: false,
        requestId: envelope.requestId,
        replyId: null,
        lastReplyId: null,
        lastRead: null,
        deliverAt
      }
  }
}

const envelopeFromDoc = (
  doc: MessageDoc,
  lastSentReply: Option.Option<Reply.Encoded>
): {
  readonly envelope: Envelope.Encoded
  readonly lastSentReply: Option.Option<Reply.Encoded>
} => {
  switch (doc.kind) {
    case "Request": {
      const envelope: Envelope.PartialRequestEncoded = {
        _tag: "Request",
        requestId: doc.requestId,
        address: {
          shardId: shardIdFromString(doc.shardId),
          entityType: doc.entityType,
          entityId: doc.entityId
        },
        tag: doc.tag ?? "",
        payload: doc.payload,
        headers: doc.headers ?? {},
        ...(doc.traceId !== undefined && { traceId: doc.traceId }),
        ...(doc.spanId !== undefined && { spanId: doc.spanId }),
        ...(doc.sampled !== undefined && { sampled: doc.sampled })
      }
      return {
        envelope,
        lastSentReply
      }
    }
    case "AckChunk":
      return {
        envelope: {
          _tag: "AckChunk",
          id: doc.rowid,
          requestId: doc.requestId,
          replyId: doc.replyId ?? "",
          address: {
            shardId: shardIdFromString(doc.shardId),
            entityType: doc.entityType,
            entityId: doc.entityId
          }
        },
        lastSentReply: Option.none()
      }
    case "Interrupt":
      return {
        envelope: {
          _tag: "Interrupt",
          id: doc.rowid,
          requestId: doc.requestId,
          address: {
            shardId: shardIdFromString(doc.shardId),
            entityType: doc.entityType,
            entityId: doc.entityId
          }
        },
        lastSentReply: Option.none()
      }
  }
}

const replyToDoc = (reply: Reply.Encoded): ReplyDoc =>
  reply._tag === "WithExit"
    ? {
      id: cosmosId(reply.id),
      _partitionKey: replyPartition(reply.requestId),
      type: "reply",
      rowid: reply.id,
      kind: "WithExit",
      requestId: reply.requestId,
      payload: reply.exit,
      sequence: null,
      acked: false
    }
    : {
      id: cosmosId(reply.id),
      _partitionKey: replyPartition(reply.requestId),
      type: "reply",
      rowid: reply.id,
      kind: "Chunk",
      requestId: reply.requestId,
      payload: reply.values,
      sequence: reply.sequence,
      acked: false
    }

const replyFromDoc = (doc: ReplyDoc): Reply.Encoded =>
  doc.kind === "WithExit"
    ? {
      _tag: "WithExit",
      id: doc.rowid,
      requestId: doc.requestId,
      exit: doc.payload
    }
    : {
      _tag: "Chunk",
      id: doc.rowid,
      requestId: doc.requestId,
      values: doc.payload,
      sequence: doc.sequence ?? 0
    }

const shardIdFromString = (shardId: string): Envelope.Encoded["address"]["shardId"] =>
  ShardId.fromStringEncoded(shardId)

const makeMachineId = (address: string) => {
  let hash = 0
  for (let i = 0; i < address.length; i++) {
    hash = Math.imul(31, hash) + address.charCodeAt(i) | 0
  }
  return Math.abs(hash)
}

const createContainer = (prefix: string) =>
  Effect.fnUntraced(function*() {
    const { db } = yield* CosmosClient
    const containerId = `${prefix}cluster`
    yield* Effect
      .tryPromise(() =>
        db.containers.create({
          id: containerId,
          partitionKey: { paths: ["/_partitionKey"], version: 2 }
        })
      )
      .pipe(Effect.catchIf(isConflict, () => Effect.void))
    return db.container(containerId)
  })

export const makeMessageStorage = Effect.fnUntraced(function*(options?: {
  readonly prefix?: string | undefined
}) {
  const prefix = options?.prefix ?? "cluster-"
  const container = yield* createContainer(prefix)().pipe(Effect.orDie)
  const containerId = `${prefix}cluster`
  const annotate = (operation: string) =>
    annotateDb({ operation, system: "cosmosdb", collection: containerId, entity: "cluster-message-storage" })

  const readMessage = (id: string, partitionKey: string) =>
    Effect.tryPromise(() => container.item(id, partitionKey).read<MessageDoc>()).pipe(
      Effect.tap(annotateItem),
      Effect.map((resp) => Option.fromNullishOr(resp.resource)),
      Effect.catchIf(isNotFound, () => Effect.succeed(Option.none()))
    )

  const queryMessages = (query: string, parameters: ReadonlyArray<CosmosParameter>) =>
    Effect
      .tryPromise(() => container.items.query<MessageDoc>({ query, parameters: Array.from(parameters) }).fetchAll())
      .pipe(
        Effect.tap(annotateFeed),
        Effect.map((resp) => resp.resources)
      )

  const queryReplies = (query: string, parameters: ReadonlyArray<CosmosParameter>) =>
    Effect
      .tryPromise(() => container.items.query<ReplyDoc>({ query, parameters: Array.from(parameters) }).fetchAll())
      .pipe(
        Effect.tap(annotateFeed),
        Effect.map((resp) => resp.resources)
      )

  const lastReply = (replyId: string | null) =>
    replyId === null
      ? Effect.succeed(Option.none<Reply.Encoded>())
      : queryReplies("SELECT * FROM c WHERE c.type = 'reply' AND c.rowid = @id", [{ name: "@id", value: replyId }])
        .pipe(
          Effect.map((docs) => Option.map(Option.fromNullishOr(docs[0]), replyFromDoc))
        )

  const markReplyAcked = (requestId: string, replyId: string) =>
    Effect
      .tryPromise(() =>
        container.item(cosmosId(replyId), replyPartition(requestId)).patch<ReplyDoc>([
          { op: "set", path: "/acked", value: true }
        ])
      )
      .pipe(
        Effect.tap(annotateItem),
        Effect.asVoid,
        Effect.catchIf(isNotFound, () => Effect.void),
        Effect.catchIf(isPreconditionFailed, () => Effect.void)
      )

  const claimMessageRead = (doc: MessageDoc, now: number) =>
    Effect
      .tryPromise(() =>
        container.item(doc.id, doc._partitionKey).patch<MessageDoc>(
          [{ op: "set", path: "/lastRead", value: now }],
          { accessCondition: { type: "IfMatch", condition: doc._etag ?? "" } }
        )
      )
      .pipe(
        Effect.tap(annotateItem),
        Effect.as(true),
        Effect.catchIf(isPreconditionFailed, () => Effect.succeed(false))
      )

  const batchDocs = <A extends { readonly id: string; readonly _partitionKey: string }>(
    docs: ReadonlyArray<A>,
    operation: (doc: A) => OperationInput,
    fallback: (doc: A) => Effect.Effect<void, unknown, never>
  ): Effect.Effect<void, unknown, never> =>
    Effect.forEach(
      Arr.groupByT(docs, (doc) => doc._partitionKey),
      ([partitionKey, partitionDocs]) =>
        Effect.forEach(
          Arr.chunksOf(partitionDocs, maxCosmosBatchOperations),
          (chunk) => {
            const operations: Array<OperationInput> = chunk.map(operation)
            return Effect
              .tryPromise(() => container.items.batch(operations, partitionKey))
              .pipe(
                Effect.tap(annotateItem),
                Effect.flatMap((resp) => {
                  const failed = resp.result?.find((result) => !isSuccessfulStatus(result.statusCode))
                  return failed === undefined ? Effect.void : Effect.fail(failed.statusCode)
                }),
                Effect.catchIf(() => true, () => Effect.forEach(chunk, fallback, { discard: true }))
              )
          },
          { discard: true }
        ),
      { discard: true }
    )

  const patchDoc = <A extends { readonly id: string; readonly _partitionKey: string }>(
    doc: A,
    resourceBody: PatchRequestBody
  ): Effect.Effect<void, unknown, never> =>
    Effect.tryPromise(() => container.item(doc.id, doc._partitionKey).patch(resourceBody)).pipe(
      Effect.tap(annotateItem),
      Effect.asVoid,
      Effect.catchIf(isNotFound, () => Effect.void)
    )

  const patchDocs = <A extends { readonly id: string; readonly _partitionKey: string }>(
    docs: ReadonlyArray<A>,
    resourceBody: (doc: A) => PatchRequestBody
  ): Effect.Effect<void, unknown, never> =>
    batchDocs(
      docs,
      (doc) => ({
        operationType: "Patch" as const,
        id: doc.id,
        resourceBody: resourceBody(doc)
      }),
      (doc) => patchDoc(doc, resourceBody(doc))
    )

  const deleteDoc = <A extends { readonly id: string; readonly _partitionKey: string }>(
    doc: A
  ): Effect.Effect<void, unknown, never> =>
    Effect.tryPromise(() => container.item(doc.id, doc._partitionKey).delete()).pipe(
      Effect.tap(annotateItem),
      Effect.asVoid,
      Effect.catchIf(isNotFound, () => Effect.void)
    )

  const deleteDocs = <A extends { readonly id: string; readonly _partitionKey: string }>(
    docs: ReadonlyArray<A>
  ): Effect.Effect<void, unknown, never> =>
    batchDocs(
      docs,
      (doc) => ({
        operationType: "Delete" as const,
        id: doc.id
      }),
      deleteDoc
    )

  return yield* MessageStorage.makeEncoded({
    saveEnvelope: ({ deliverAt, envelope, primaryKey }) =>
      Effect
        .gen(function*() {
          const doc = envelopeToDoc(envelope, primaryKey, deliverAt)
          if (envelope._tag === "AckChunk") {
            yield* markReplyAcked(envelope.requestId, envelope.replyId)
            const pendingAcks = yield* queryMessages(
              "SELECT * FROM c WHERE c.type = 'message' AND c.kind = 'AckChunk' AND c.processed = false AND c.requestId = @requestId",
              [{ name: "@requestId", value: envelope.requestId }]
            )
            yield* patchDocs(pendingAcks, () => [{ op: "set", path: "/processed", value: true }])
          }
          return yield* Effect.tryPromise(() => container.items.create(doc)).pipe(
            Effect.tap(annotateItem),
            Effect.as<MessageStorage.SaveResult.Encoded>(SaveResultEncoded.Success()),
            Effect.catchIf(isConflict, () =>
              readMessage(doc.id, doc._partitionKey).pipe(
                Effect.flatMap((found) =>
                  Option.match(found, {
                    onNone: () => Effect.succeed<MessageStorage.SaveResult.Encoded>(SaveResultEncoded.Success()),
                    onSome: (existing) =>
                      lastReply(existing.lastReplyId).pipe(
                        Effect.map((lastReceivedReply) =>
                          SaveResultEncoded.Duplicate({
                            originalId: Snowflake.Snowflake(existing.requestId),
                            lastReceivedReply
                          })
                        )
                      )
                  })
                )
              ))
          )
        })
        .pipe(annotate("saveEnvelope"), refailPersistence, withTracerDisabled),

    saveReply: (reply) =>
      Effect
        .gen(function*() {
          const doc = replyToDoc(reply)
          yield* Effect.tryPromise(() => container.items.create(doc)).pipe(
            Effect.tap(annotateItem),
            Effect.catchIf(isConflict, () => Effect.void)
          )
          const messages = yield* queryMessages(
            "SELECT * FROM c WHERE c.type = 'message' AND c.requestId = @requestId",
            [{ name: "@requestId", value: reply.requestId }]
          )
          const updatedMessages = reply._tag === "WithExit"
            ? messages
            : messages.filter((message) => message.id === reply.requestId || message.kind === "Request")
          yield* patchDocs(updatedMessages, () =>
            reply._tag === "WithExit"
              ? [
                { op: "set", path: "/processed", value: true },
                { op: "set", path: "/lastReplyId", value: reply.id }
              ]
              : [{ op: "set", path: "/lastReplyId", value: reply.id }])
        })
        .pipe(annotate("saveReply"), refailPersistence, withTracerDisabled),

    clearReplies: (requestId) =>
      Effect
        .gen(function*() {
          const id = String(requestId)
          const replies = yield* queryReplies(
            "SELECT * FROM c WHERE c.type = 'reply' AND c.requestId = @requestId AND c.kind = 'WithExit'",
            [
              { name: "@requestId", value: id }
            ]
          )
          yield* deleteDocs(replies)
          const messages = yield* queryMessages(
            "SELECT * FROM c WHERE c.type = 'message' AND c.requestId = @requestId",
            [{ name: "@requestId", value: id }]
          )
          yield* deleteDocs(messages.filter((message) => message.kind === "Interrupt"))
          yield* patchDocs(
            messages.filter((message) => message.kind !== "Interrupt"),
            () => [
              { op: "set", path: "/processed", value: false },
              { op: "set", path: "/lastReplyId", value: null },
              { op: "set", path: "/lastRead", value: null }
            ]
          )
        })
        .pipe(annotate("clearReplies"), refailPersistence, withTracerDisabled),

    requestIdForPrimaryKey: (primaryKey) =>
      queryMessages("SELECT * FROM c WHERE c.type = 'message' AND c.messageId = @primaryKey", [
        { name: "@primaryKey", value: primaryKey }
      ])
        .pipe(
          Effect.map((docs) => Option.map(Option.fromNullishOr(docs[0]?.requestId), Snowflake.Snowflake)),
          annotate("requestIdForPrimaryKey"),
          refailPersistence,
          withTracerDisabled
        ),

    repliesFor: (requestIds) =>
      queryReplies(
        "SELECT * FROM c WHERE c.type = 'reply' AND ARRAY_CONTAINS(@requestIds, c.requestId) AND (c.kind = 'WithExit' OR (c.kind = 'Chunk' AND c.acked = false)) ORDER BY c.rowid",
        [{ name: "@requestIds", value: Array.from(requestIds) }]
      )
        .pipe(
          Effect.map(Arr.map(replyFromDoc)),
          annotate("repliesFor"),
          refailPersistence,
          withTracerDisabled
        ),

    repliesForUnfiltered: (requestIds) =>
      queryReplies(
        "SELECT * FROM c WHERE c.type = 'reply' AND ARRAY_CONTAINS(@requestIds, c.requestId) ORDER BY c.rowid",
        [{ name: "@requestIds", value: Array.from(requestIds) }]
      )
        .pipe(
          Effect.map(Arr.map(replyFromDoc)),
          annotate("repliesForUnfiltered"),
          refailPersistence,
          withTracerDisabled
        ),

    unprocessedMessages: (shardIds, now) =>
      queryMessages(
        "SELECT * FROM c WHERE c.type = 'message' AND ARRAY_CONTAINS(@shardIds, c.shardId) AND c.processed = false AND (NOT IS_DEFINED(c.lastRead) OR IS_NULL(c.lastRead) OR c.lastRead < @lastReadBefore) AND (NOT IS_DEFINED(c.deliverAt) OR IS_NULL(c.deliverAt) OR c.deliverAt <= @now) ORDER BY c.rowid",
        [
          { name: "@shardIds", value: Array.from(shardIds) },
          { name: "@lastReadBefore", value: now - tenMinutes },
          { name: "@now", value: now }
        ]
      )
        .pipe(
          Effect.flatMap((docs) => collectUnprocessed(docs, now, claimMessageRead, queryReplies)),
          annotate("unprocessedMessages"),
          refailPersistence,
          withTracerDisabled
        ),

    unprocessedMessagesById: (messageIds, now) =>
      queryMessages(
        "SELECT * FROM c WHERE c.type = 'message' AND (ARRAY_CONTAINS(@messageIds, c.id) OR ARRAY_CONTAINS(@messageIds, c.requestId)) AND c.processed = false AND (NOT IS_DEFINED(c.deliverAt) OR IS_NULL(c.deliverAt) OR c.deliverAt <= @now) ORDER BY c.rowid",
        [
          { name: "@messageIds", value: Array.from(messageIds, String) },
          { name: "@now", value: now }
        ]
      )
        .pipe(
          Effect.flatMap((docs) => collectUnprocessedById(docs, queryReplies)),
          annotate("unprocessedMessagesById"),
          refailPersistence,
          withTracerDisabled
        ),

    resetAddress: (address) =>
      queryMessages(
        "SELECT * FROM c WHERE c.type = 'message' AND c.processed = false AND c.shardId = @shardId AND c.entityType = @entityType AND c.entityId = @entityId",
        [
          { name: "@shardId", value: ShardId.toString(address.shardId) },
          { name: "@entityType", value: address.entityType },
          { name: "@entityId", value: address.entityId }
        ]
      )
        .pipe(
          Effect.flatMap((docs) => patchDocs(docs, () => [{ op: "set", path: "/lastRead", value: null }])),
          annotate("resetAddress"),
          refailPersistence,
          withTracerDisabled
        ),

    clearAddress: (address) =>
      queryMessages(
        "SELECT * FROM c WHERE c.type = 'message' AND c.entityType = @entityType AND c.entityId = @entityId",
        [
          { name: "@entityType", value: address.entityType },
          { name: "@entityId", value: address.entityId }
        ]
      )
        .pipe(
          Effect.flatMap((messages) => {
            if (!Arr.isArrayNonEmpty(messages)) return Effect.void
            const requestIds = Array.from(new Set(messages.map((message) => message.requestId)))
            return queryReplies(
              "SELECT * FROM c WHERE c.type = 'reply' AND ARRAY_CONTAINS(@requestIds, c.requestId)",
              [{ name: "@requestIds", value: requestIds }]
            )
              .pipe(
                Effect.flatMap((replies) => deleteDocs(replies)),
                Effect.andThen(deleteDocs(messages))
              )
          }),
          annotate("clearAddress"),
          refailPersistence,
          withTracerDisabled
        ),

    resetShards: (shardIds) =>
      queryMessages(
        "SELECT * FROM c WHERE c.type = 'message' AND c.processed = false AND ARRAY_CONTAINS(@shardIds, c.shardId)",
        [{ name: "@shardIds", value: Array.from(shardIds) }]
      )
        .pipe(
          Effect.flatMap((docs) => patchDocs(docs, () => [{ op: "set", path: "/lastRead", value: null }])),
          annotate("resetShards"),
          refailPersistence,
          withTracerDisabled
        ),

    withTransaction: (effect) => effect
  })
})

const collectUnprocessed = <E>(
  docs: ReadonlyArray<MessageDoc>,
  now: number,
  claimMessageRead: (doc: MessageDoc, now: number) => Effect.Effect<boolean, E>,
  queryReplies: (
    query: string,
    parameters: ReadonlyArray<CosmosParameter>
  ) => Effect.Effect<Array<ReplyDoc>, E>
) =>
  Effect.gen(function*() {
    const messages: Array<{
      readonly envelope: Envelope.Encoded
      readonly lastSentReply: Option.Option<Reply.Encoded>
    }> = []
    const activeRequestIds = yield* activeReplyRequestIds(docs, queryReplies)
    const lastReplies = yield* lastRepliesById(docs, activeRequestIds, queryReplies)
    for (const doc of docs) {
      if (activeRequestIds.has(doc.requestId)) continue
      const sentReply = Option.fromNullishOr(doc.lastReplyId === null ? undefined : lastReplies.get(doc.lastReplyId))
      const claimed = yield* claimMessageRead(doc, now)
      if (claimed) {
        messages.push(envelopeFromDoc({ ...doc, lastRead: now }, sentReply))
      }
    }
    return messages
  })

const collectUnprocessedById = <E>(
  docs: ReadonlyArray<MessageDoc>,
  queryReplies: (
    query: string,
    parameters: ReadonlyArray<CosmosParameter>
  ) => Effect.Effect<Array<ReplyDoc>, E>
) =>
  Effect.gen(function*() {
    const messages: Array<{
      readonly envelope: Envelope.Encoded
      readonly lastSentReply: Option.Option<Reply.Encoded>
    }> = []
    const activeRequestIds = yield* activeReplyRequestIds(docs, queryReplies)
    const lastReplies = yield* lastRepliesById(docs, activeRequestIds, queryReplies)
    for (const doc of docs) {
      if (activeRequestIds.has(doc.requestId)) continue
      const sentReply = Option.fromNullishOr(doc.lastReplyId === null ? undefined : lastReplies.get(doc.lastReplyId))
      messages.push(envelopeFromDoc(doc, sentReply))
    }
    return messages
  })

const activeReplyRequestIds = <E>(
  docs: ReadonlyArray<MessageDoc>,
  queryReplies: (
    query: string,
    parameters: ReadonlyArray<CosmosParameter>
  ) => Effect.Effect<Array<ReplyDoc>, E>
) => {
  const requestIds = Array.from(new Set(docs.map((doc) => doc.requestId)))
  if (!Arr.isArrayNonEmpty(requestIds)) return Effect.succeed(new Set<string>())
  return queryReplies(
    "SELECT * FROM c WHERE c.type = 'reply' AND ARRAY_CONTAINS(@requestIds, c.requestId) AND (c.kind = 'WithExit' OR (c.kind = 'Chunk' AND c.acked = false))",
    [{ name: "@requestIds", value: requestIds }]
  )
    .pipe(Effect.map((replies) => new Set(replies.map((reply) => reply.requestId))))
}

const lastRepliesById = <E>(
  docs: ReadonlyArray<MessageDoc>,
  activeRequestIds: ReadonlySet<string>,
  queryReplies: (
    query: string,
    parameters: ReadonlyArray<CosmosParameter>
  ) => Effect.Effect<Array<ReplyDoc>, E>
) => {
  const replyIds = Array.from(
    new Set(docs
      .flatMap((doc) => activeRequestIds.has(doc.requestId) || doc.lastReplyId === null ? [] : [doc.lastReplyId]))
  )
  if (!Arr.isArrayNonEmpty(replyIds)) return Effect.succeed(new Map<string, Reply.Encoded>())
  return queryReplies(
    "SELECT * FROM c WHERE c.type = 'reply' AND ARRAY_CONTAINS(@replyIds, c.rowid)",
    [{ name: "@replyIds", value: replyIds }]
  )
    .pipe(Effect.map((replies) => new Map(replies.map((reply) => [reply.rowid, replyFromDoc(reply)]))))
}

export const makeRunnerStorage = Effect.fnUntraced(function*(options?: {
  readonly prefix?: string | undefined
}) {
  const prefix = options?.prefix ?? "cluster-"
  const container = yield* createContainer(prefix)().pipe(Effect.orDie)
  const config = yield* ShardingConfig.ShardingConfig
  const expires = Duration.toMillis(Duration.fromInputUnsafe(config.shardLockExpiration))
  const containerId = `${prefix}cluster`
  const annotate = (operation: string) =>
    annotateDb({ operation, system: "cosmosdb", collection: containerId, entity: "cluster-runner-storage" })

  const queryRunners = (query: string, parameters: ReadonlyArray<CosmosParameter>) =>
    Effect
      .tryPromise(() =>
        container
          .items
          .query<RunnerDoc>({ query, parameters: Array.from(parameters) }, { partitionKey: "runner" })
          .fetchAll()
      )
      .pipe(Effect.tap(annotateFeed), Effect.map((resp) => resp.resources))

  const deleteRunner = (doc: RunnerDoc) =>
    Effect
      .tryPromise(() =>
        container.item(doc.id, "runner").delete({
          accessCondition: { type: "IfMatch", condition: doc._etag ?? "" }
        })
      )
      .pipe(
        Effect.tap(annotateItem),
        Effect.asVoid,
        Effect.catchIf(isNotFound, () => Effect.void),
        Effect.catchIf(isPreconditionFailed, () => Effect.void)
      )

  const readLock = (shardId: string) =>
    Effect.tryPromise(() => container.item(lockDocId(shardId), "lock").read<LockDoc>()).pipe(
      Effect.tap(annotateItem),
      Effect.map((resp) => Option.fromNullishOr(resp.resource)),
      Effect.catchIf(isNotFound, () => Effect.succeed(Option.none()))
    )

  const writeLock = (doc: LockDoc) =>
    Effect
      .tryPromise(() =>
        container.item(doc.id, "lock").replace(doc, {
          accessCondition: { type: "IfMatch", condition: doc._etag ?? "" }
        })
      )
      .pipe(
        Effect.tap(annotateItem),
        Effect.as(true),
        Effect.catchIf(isPreconditionFailed, () => Effect.succeed(false))
      )

  const deleteLock = (doc: LockDoc) =>
    Effect
      .tryPromise(() =>
        container.item(doc.id, "lock").delete({
          accessCondition: { type: "IfMatch", condition: doc._etag ?? "" }
        })
      )
      .pipe(
        Effect.tap(annotateItem),
        Effect.asVoid,
        Effect.catchIf(isNotFound, () => Effect.void),
        Effect.catchIf(isPreconditionFailed, () => Effect.void)
      )

  const createLock = (address: string, shardId: string, now: number) =>
    Effect
      .tryPromise(() =>
        container.items.create<LockDoc>({
          id: lockDocId(shardId),
          _partitionKey: "lock",
          type: "lock",
          shardId,
          address,
          acquiredAt: now
        })
      )
      .pipe(
        Effect.tap(annotateItem),
        Effect.as(true),
        Effect.catchIf(isConflict, () => Effect.succeed(false))
      )

  const tryAcquire = (address: string, shardId: string, now: number) =>
    readLock(shardId).pipe(
      Effect.flatMap((lock) =>
        Option.match(lock, {
          onNone: () => createLock(address, shardId, now),
          onSome: (doc) => {
            if (doc.address !== address && now - doc.acquiredAt <= expires) {
              return Effect.succeed(false)
            }
            doc.address = address
            doc.acquiredAt = now
            return writeLock(doc)
          }
        })
      ),
      Effect.map((acquired) => acquired ? Option.some(shardId) : Option.none())
    )

  return RunnerStorage.makeEncoded({
    getRunners: Effect.sync(() => Date.now()).pipe(
      Effect.flatMap((now) =>
        queryRunners("SELECT * FROM c WHERE c.type = 'runner' AND c.lastHeartbeat > @expiresAt", [
          { name: "@expiresAt", value: now - expires }
        ])
      ),
      Effect.map((docs) => docs.map((doc) => [doc.runner, doc.healthy] as const)),
      annotate("getRunners"),
      refailPersistence,
      withTracerDisabled
    ),

    register: (address, runner, healthy) =>
      Effect.sync(() => Date.now()).pipe(
        Effect.flatMap((now) =>
          Effect
            .tryPromise(() =>
              container.items.upsert<RunnerDoc>({
                id: runnerDocId(address),
                _partitionKey: "runner",
                type: "runner",
                address,
                runner,
                healthy,
                lastHeartbeat: now
              })
            )
            .pipe(Effect.tap(annotateItem))
        ),
        Effect.as(makeMachineId(address)),
        annotate("register"),
        refailPersistence,
        withTracerDisabled
      ),

    unregister: (address) =>
      Effect.sync(() => Date.now()).pipe(
        Effect.flatMap((now) =>
          queryRunners(
            "SELECT * FROM c WHERE c.type = 'runner' AND (c.address = @address OR c.lastHeartbeat < @expiresAt)",
            [
              { name: "@address", value: address },
              { name: "@expiresAt", value: now - expires }
            ]
          )
        ),
        Effect.flatMap((docs) => Effect.forEach(docs, deleteRunner, { discard: true })),
        annotate("unregister"),
        refailPersistence,
        withTracerDisabled
      ),

    setRunnerHealth: (address, healthy) =>
      Effect
        .tryPromise(() =>
          container.item(runnerDocId(address), "runner").patch<RunnerDoc>([
            { op: "set", path: "/healthy", value: healthy }
          ])
        )
        .pipe(
          Effect.tap(annotateItem),
          Effect.asVoid,
          Effect.catchIf(isNotFound, () => Effect.void),
          annotate("setRunnerHealth"),
          refailPersistence,
          withTracerDisabled
        ),

    acquire: (address, shardIds) =>
      Effect.sync(() => Date.now()).pipe(
        Effect.flatMap((now) => Effect.forEach(shardIds, (shardId) => tryAcquire(address, shardId, now))),
        Effect.map(Arr.getSomes),
        annotate("acquire"),
        refailPersistence,
        withTracerDisabled
      ),

    refresh: (address, shardIds) =>
      Effect
        .gen(function*() {
          const now = Date.now()
          yield* Effect
            .tryPromise(() =>
              container.item(runnerDocId(address), "runner").patch<RunnerDoc>([
                { op: "set", path: "/lastHeartbeat", value: now }
              ])
            )
            .pipe(
              Effect.tap(annotateItem),
              Effect.asVoid,
              Effect.catchIf(isNotFound, () => Effect.void)
            )
          const refreshed = yield* Effect.forEach(shardIds, (shardId) =>
            readLock(shardId).pipe(
              Effect.flatMap((lock) =>
                Option.match(lock, {
                  onNone: () => Effect.succeed(Option.none<string>()),
                  onSome: (doc) => {
                    if (doc.address !== address) return Effect.succeed(Option.none<string>())
                    doc.acquiredAt = now
                    return writeLock(doc).pipe(Effect.map((ok) => ok ? Option.some(shardId) : Option.none<string>()))
                  }
                })
              )
            ))
          return Arr.getSomes(refreshed)
        })
        .pipe(annotate("refresh"), refailPersistence, withTracerDisabled),

    release: (address, shardId) =>
      readLock(shardId).pipe(
        Effect.flatMap((lock) =>
          Option.match(lock, {
            onNone: () => Effect.void,
            onSome: (doc) =>
              doc.address === address
                ? deleteLock(doc)
                : Effect.void
          })
        ),
        annotate("release"),
        refailPersistence,
        withTracerDisabled
      ),

    releaseAll: (address) =>
      Effect
        .tryPromise(() =>
          container
            .items
            .query<LockDoc>({
              query: "SELECT * FROM c WHERE c.type = 'lock' AND c.address = @address",
              parameters: [{ name: "@address", value: address }]
            }, { partitionKey: "lock" })
            .fetchAll()
        )
        .pipe(
          Effect.tap(annotateFeed),
          Effect.flatMap((resp) => Effect.forEach(resp.resources, deleteLock, { discard: true })),
          annotate("releaseAll"),
          refailPersistence,
          withTracerDisabled
        )
  })
})

export const layerMessageStorage = (options?: {
  readonly prefix?: string | undefined
}): Layer.Layer<MessageStorage.MessageStorage, never, CosmosClient | ShardingConfig.ShardingConfig> =>
  Layer.effect(MessageStorage.MessageStorage, makeMessageStorage(options)).pipe(
    Layer.provide(Snowflake.layerGenerator)
  )

export const layerRunnerStorage = (options?: {
  readonly prefix?: string | undefined
}): Layer.Layer<RunnerStorage.RunnerStorage, never, CosmosClient | ShardingConfig.ShardingConfig> =>
  Layer.effect(RunnerStorage.RunnerStorage, makeRunnerStorage(options))

export const layerStorage = (options?: {
  readonly prefix?: string | undefined
}): Layer.Layer<
  MessageStorage.MessageStorage | RunnerStorage.RunnerStorage,
  never,
  CosmosClient | ShardingConfig.ShardingConfig
> => Layer.merge(layerMessageStorage(options), layerRunnerStorage(options))

export const layerCosmos = (config: ClusterCosmosConfig): Layer.Layer<
  MessageStorage.MessageStorage | RunnerStorage.RunnerStorage,
  never,
  ShardingConfig.ShardingConfig
> =>
  layerStorage({ prefix: config.prefix }).pipe(
    Layer.provide(CosmosClientLayer(Redacted.value(config.url), config.dbName))
  )

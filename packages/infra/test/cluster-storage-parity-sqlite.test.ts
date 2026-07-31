import { SqliteClient } from "@effect/sql-sqlite-node"
import { assert, describe, it } from "@effect/vitest"
import { Context, Effect, Exit, Layer, Option, Schema } from "effect"
import { HttpHeaders } from "effect-app/http"
import { EntityAddress, EntityId, EntityType, Envelope, Message, MessageStorage, Reply, ShardId, ShardingConfig, Snowflake, SqlMessageStorage } from "effect/unstable/cluster"
import { Rpc, RpcSchema } from "effect/unstable/rpc"

const testRunId = `${Date.now()}-${process.pid}-${Math.random().toString(16).slice(2)}`

describe("Cluster storage parity on sqlite", () => {
  it.effect("fails on duplicate WithExit for the same request", () =>
    Effect
      .gen(function*() {
        const storage = yield* MessageStorage.MessageStorage
        const request = yield* makeStreamRequest(`sqlite-duplicate-with-exit/${testRunId}`)
        yield* storage.saveRequest(request)
        yield* storage.saveReply(yield* makeStreamReply(request))

        const duplicateAttempt = storage.saveReply(yield* makeStreamReply(request))
        const error = yield* Effect.flip(duplicateAttempt)
        assert.strictEqual(error._tag, "PersistenceError")
      })
      .pipe(Effect.provide(messageStorageLayer())))

  it.effect("fails on duplicate Chunk sequence for the same request", () =>
    Effect
      .gen(function*() {
        const storage = yield* MessageStorage.MessageStorage
        const request = yield* makeStreamRequest(`sqlite-duplicate-chunk-sequence/${testRunId}`)
        yield* storage.saveRequest(request)
        yield* storage.saveReply(yield* makeChunkReply(request, 0))

        const duplicateAttempt = storage.saveReply(yield* makeChunkReply(request, 0))
        const error = yield* Effect.flip(duplicateAttempt)
        assert.strictEqual(error._tag, "PersistenceError")
      })
      .pipe(Effect.provide(messageStorageLayer())))
})

class StreamRpc extends Rpc.make("ClusterStorageParityStreamRpc", {
  success: RpcSchema.Stream(Schema.Void, Schema.Never),
  payload: {
    id: Schema.String
  },
  primaryKey: (value) => value.id.toString()
}) {}

const messageStorageLayer = () =>
  SqlMessageStorage.layerWith({ prefix: `cluster_parity_sqlite_${testRunId.replace(/-/g, "_")}` }).pipe(
    Layer.provideMerge(Snowflake.layerGenerator),
    Layer.provide(ShardingConfig.layerDefaults),
    Layer.provide(SqliteClient.layer({ filename: ":memory:" }))
  )

const makeStreamRequest = Effect.fnUntraced(function*(id: string) {
  const snowflake = yield* Snowflake.Generator
  return new Message.OutgoingRequest({
    envelope: Envelope.makeRequest<typeof StreamRpc>({
      requestId: snowflake.nextUnsafe(),
      address: EntityAddress.make({
        shardId: ShardId.make(`cluster-sqlite-parity-${testRunId}`, 1),
        entityType: EntityType.make("parity-test"),
        entityId: EntityId.make("1")
      }),
      tag: StreamRpc._tag,
      payload: StreamRpc.payloadSchema.make({ id }),
      traceId: "noop",
      spanId: "noop",
      sampled: false,
      headers: HttpHeaders.empty
    }),
    annotations: StreamRpc.annotations,
    context: Context.empty(),
    rpc: StreamRpc,
    lastReceivedReply: Option.none(),
    respond() {
      return Effect.void
    }
  })
})

const makeStreamReply = Effect.fnUntraced(function*(request: Message.OutgoingRequest<typeof StreamRpc>) {
  const snowflake = yield* Snowflake.Generator
  return new Reply.ReplyWithContext({
    reply: new Reply.WithExit<typeof StreamRpc>({
      id: snowflake.nextUnsafe(),
      requestId: request.envelope.requestId,
      exit: Exit.void
    }),
    context: request.context,
    rpc: request.rpc
  })
})

const makeChunkReply = Effect.fnUntraced(function*(
  request: Message.OutgoingRequest<typeof StreamRpc>,
  sequence: number
) {
  const snowflake = yield* Snowflake.Generator
  return new Reply.ReplyWithContext({
    reply: new Reply.Chunk<typeof StreamRpc>({
      id: snowflake.nextUnsafe(),
      requestId: request.envelope.requestId,
      sequence,
      values: [undefined]
    }),
    context: request.context,
    rpc: request.rpc
  })
})

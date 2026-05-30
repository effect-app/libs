import { assert, describe, expect, it } from "@effect/vitest"
import { Context, Effect, Exit, Fiber, Latch, Layer, Option, Redacted, Schema } from "effect"
import { TestClock } from "effect/testing"
import { EntityAddress, EntityId, EntityType, Envelope, Message, MessageStorage, Reply, Runner, RunnerAddress, RunnerStorage, ShardId, ShardingConfig, Snowflake } from "effect/unstable/cluster"
import { Headers } from "effect/unstable/http"
import { Rpc, RpcSchema } from "effect/unstable/rpc"
import { layerCosmos } from "../src/ClusterCosmos.js"

const cosmosUrl = process.env["COSMOS_TEST_URL"]
const cosmosDb = process.env["COSMOS_TEST_DB"] ?? "cluster-test"
const testRunId = `${Date.now()}-${process.pid}`
const runnerPortBase = 10000 + Date.now() % 40000

const layerFor = () =>
  layerCosmos({
    url: Redacted.make(cosmosUrl ?? ""),
    dbName: cosmosDb,
    prefix: "test-cluster-"
  })
    .pipe(
      Layer.provideMerge(Snowflake.layerGenerator),
      Layer.provide(ShardingConfig.layerDefaults)
    )

describe.skipIf(!cosmosUrl)("ClusterCosmos MessageStorage", () => {
  it.effect("deduplicates keyed requests and returns the last reply", () =>
    Effect
      .gen(function*() {
        const storage = yield* MessageStorage.MessageStorage
        const shardId = testShardId("message-duplicate")
        const request = yield* makeStreamRequest(123, shardId)

        const saved = yield* storage.saveRequest(request)
        assert.strictEqual(saved._tag, "Success")

        const chunk = yield* makeChunkReply(request, 0)
        yield* storage.saveReply(chunk)

        const duplicateWithChunk = yield* storage.saveRequest(
          yield* makeStreamRequest(123, shardId)
        )
        assert(duplicateWithChunk._tag === "Duplicate" && Option.isSome(duplicateWithChunk.lastReceivedReply))
        assert.strictEqual(duplicateWithChunk.lastReceivedReply.value._tag, "Chunk")

        const ackChunk = yield* makeAckChunk(request, chunk)
        yield* storage.saveEnvelope(ackChunk)
        const repliesAfterAck = yield* storage.repliesFor([request])
        assert.strictEqual(repliesAfterAck.length, 0)

        yield* storage.saveReply(yield* makeStreamReply(request))
        const duplicateWithExit = yield* storage.saveRequest(
          yield* makeStreamRequest(123, shardId)
        )
        assert(duplicateWithExit._tag === "Duplicate" && Option.isSome(duplicateWithExit.lastReceivedReply))
        assert.strictEqual(duplicateWithExit.lastReceivedReply.value._tag, "WithExit")
      })
      .pipe(Effect.provide(layerFor())))

  it.effect("marks reads, resets shards, and excludes completed requests", () =>
    Effect
      .gen(function*() {
        const storage = yield* MessageStorage.MessageStorage
        const shardId = testShardId("message-unprocessed")
        const request1 = yield* makeRequest({ payload: { id: 1 }, shardId })
        const request2 = yield* makeRequest({ payload: { id: 2 }, shardId })
        yield* storage.saveRequest(request1)
        yield* storage.saveRequest(request2)

        let messages = yield* storage.unprocessedMessages([request1.envelope.address.shardId])
        assert.deepStrictEqual(messages.map((message) => requestPayloadId(message)).sort(), [1, 2])

        messages = yield* storage.unprocessedMessages([request1.envelope.address.shardId])
        assert.strictEqual(messages.length, 0)

        yield* storage.resetShards([request1.envelope.address.shardId])
        messages = yield* storage.unprocessedMessages([request1.envelope.address.shardId])
        assert.deepStrictEqual(messages.map((message) => requestPayloadId(message)).sort(), [1, 2])

        yield* storage.saveReply(yield* makeReply(request1))
        yield* storage.resetShards([request1.envelope.address.shardId])
        messages = yield* storage.unprocessedMessages([request1.envelope.address.shardId])
        assert.deepStrictEqual(messages.map((message) => requestPayloadId(message)), [2])
      })
      .pipe(Effect.provide(layerFor())))

  it.effect("notifies registered reply handlers", () =>
    Effect
      .gen(function*() {
        const storage = yield* MessageStorage.MessageStorage
        const latch = yield* Latch.make()
        const request = yield* makeRequest({ shardId: testShardId("message-handler") })
        yield* storage.saveRequest(request)

        const fiber = yield* storage
          .registerReplyHandler(
            new Message.OutgoingRequest({
              ...request,
              respond: () => latch.open
            })
          )
          .pipe(Effect.forkChild)

        yield* TestClock.adjust(1)
        yield* storage.saveReply(yield* makeReply(request))
        yield* latch.await
        yield* Fiber.await(fiber)
      })
      .pipe(Effect.provide(layerFor())))
})

describe.skipIf(!cosmosUrl)("ClusterCosmos RunnerStorage", () => {
  it.effect("registers runners and tracks health", () =>
    Effect
      .gen(function*() {
        const storage = yield* RunnerStorage.RunnerStorage
        const runnerAddress = testRunnerAddress(1)
        const runner = Runner.make({
          address: runnerAddress,
          groups: ["default"],
          weight: 1
        })

        const machineId1 = yield* storage.register(runner, true)
        const machineId2 = yield* storage.register(runner, true)
        assert.deepStrictEqual(machineId2, machineId1)
        expect(runnerStatus(yield* storage.getRunners, runnerAddress)).toEqual([runner, true])

        yield* storage.setRunnerHealth(runnerAddress, false)
        expect(runnerStatus(yield* storage.getRunners, runnerAddress)).toEqual([runner, false])

        yield* storage.unregister(runnerAddress)
        expect(runnerStatus(yield* storage.getRunners, runnerAddress)).toBeUndefined()
      })
      .pipe(Effect.provide(layerFor())))

  it.effect("acquires, refreshes, releases, and re-acquires shard locks", () =>
    Effect
      .gen(function*() {
        const storage = yield* RunnerStorage.RunnerStorage
        const runnerAddress1 = testRunnerAddress(2)
        const runnerAddress2 = testRunnerAddress(3)
        const shards = [
          testShardId("runner-locks", 1),
          testShardId("runner-locks", 2),
          testShardId("runner-locks", 3)
        ]

        let acquired = yield* storage.acquire(runnerAddress1, shards)
        assert.deepStrictEqual(acquired.map((shard) => shard.id), [1, 2, 3])

        acquired = yield* storage.acquire(runnerAddress2, shards)
        assert.deepStrictEqual(acquired.map((shard) => shard.id), [])

        const refreshed = yield* storage.refresh(runnerAddress1, shards)
        assert.deepStrictEqual(refreshed.map((shard) => shard.id), [1, 2, 3])

        yield* storage.release(runnerAddress1, testShardId("runner-locks", 2))
        acquired = yield* storage.acquire(runnerAddress2, shards)
        assert.deepStrictEqual(acquired.map((shard) => shard.id), [2])

        yield* storage.releaseAll(runnerAddress1)
        acquired = yield* storage.acquire(runnerAddress2, shards)
        assert.deepStrictEqual(acquired.map((shard) => shard.id), [1, 2, 3])
      })
      .pipe(Effect.provide(layerFor())))
})

const GetUserRpc = Rpc.make("GetUser", {
  payload: { id: Schema.Number }
})

class StreamRpc extends Rpc.make("StreamTest", {
  success: RpcSchema.Stream(Schema.Void, Schema.Never),
  payload: {
    id: Schema.Number
  },
  primaryKey: (value) => value.id.toString()
}) {}

const makeRequest = Effect.fnUntraced(function*(options?: {
  readonly payload?: { readonly id: number }
  readonly shardId?: ShardId.ShardId
}) {
  const snowflake = yield* Snowflake.Generator
  return new Message.OutgoingRequest({
    envelope: Envelope.makeRequest<typeof GetUserRpc>({
      requestId: snowflake.nextUnsafe(),
      address: EntityAddress.make({
        shardId: options?.shardId ?? testShardId("default"),
        entityType: EntityType.make("test"),
        entityId: EntityId.make("1")
      }),
      tag: GetUserRpc._tag,
      payload: options?.payload ?? { id: 123 },
      traceId: "noop",
      spanId: "noop",
      sampled: false,
      headers: Headers.empty
    }),
    annotations: GetUserRpc.annotations,
    context: Context.empty(),
    rpc: GetUserRpc,
    lastReceivedReply: Option.none(),
    respond() {
      return Effect.void
    }
  })
})

const makeStreamRequest = Effect.fnUntraced(function*(id: number, shardId = testShardId("stream")) {
  const snowflake = yield* Snowflake.Generator
  return new Message.OutgoingRequest({
    envelope: Envelope.makeRequest<typeof StreamRpc>({
      requestId: snowflake.nextUnsafe(),
      address: EntityAddress.make({
        shardId,
        entityType: EntityType.make("test"),
        entityId: EntityId.make("1")
      }),
      tag: StreamRpc._tag,
      payload: StreamRpc.payloadSchema.make({ id }),
      traceId: "noop",
      spanId: "noop",
      sampled: false,
      headers: Headers.empty
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

const makeReply = Effect.fnUntraced(function*(request: Message.OutgoingRequest<typeof GetUserRpc>) {
  const snowflake = yield* Snowflake.Generator
  return new Reply.ReplyWithContext({
    reply: new Reply.WithExit<typeof GetUserRpc>({
      id: snowflake.nextUnsafe(),
      requestId: request.envelope.requestId,
      exit: Exit.void
    }),
    context: request.context,
    rpc: request.rpc
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

const makeAckChunk = Effect.fnUntraced(function*(
  request: Message.OutgoingRequest<typeof StreamRpc>,
  chunk: Reply.ReplyWithContext<typeof StreamRpc>
) {
  const snowflake = yield* Snowflake.Generator
  return new Message.OutgoingEnvelope({
    envelope: new Envelope.AckChunk({
      id: snowflake.nextUnsafe(),
      address: request.envelope.address,
      requestId: chunk.reply.requestId,
      replyId: chunk.reply.id
    }),
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

const requestPayloadId = (message: Message.Incoming<never>) => {
  if (message.envelope._tag !== "Request") {
    throw new Error(`Expected Request envelope`)
  }
  const envelope = message.envelope
  assert(typeof envelope.payload === "object" && envelope.payload !== null)
  assert("id" in envelope.payload)
  assert.strictEqual(typeof envelope.payload.id, "number")
  return envelope.payload.id
}

const testShardId = (label: string, id = 1) => ShardId.make(`cluster-cosmos-${testRunId}-${label}`, id)

const testRunnerAddress = (offset: number) => RunnerAddress.make("localhost", runnerPortBase + offset)

const runnerStatus = (
  runners: ReadonlyArray<readonly [Runner.Runner, boolean]>,
  address: RunnerAddress.RunnerAddress
) => runners.find(([runner]) => runner.address.host === address.host && runner.address.port === address.port)

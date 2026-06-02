import { assert, describe, expect, it } from "@effect/vitest"
import { Context, Duration, Effect, Exit, Fiber, Latch, Layer, Option, Redacted, Schema } from "effect"
import { TestClock } from "effect/testing"
import { ClusterSchema, ClusterWorkflowEngine, Entity, EntityAddress, EntityId, EntityType, Envelope, Message, MessageStorage, Reply, Runner, RunnerAddress, RunnerHealth, Runners, RunnerStorage, ShardId, Sharding, ShardingConfig, Snowflake } from "effect/unstable/cluster"
import { Headers } from "effect/unstable/http"
import { Rpc, RpcSchema } from "effect/unstable/rpc"
import { DurableDeferred, Workflow } from "effect/unstable/workflow"
import { layerCosmos } from "../src/ClusterCosmos.js"

const cosmosUrl = process.env["COSMOS_TEST_URL"]
const cosmosDb = process.env["COSMOS_TEST_DB"] ?? "cluster-test"
const testRunId = `${Date.now()}-${process.pid}-${Math.random().toString(16).slice(2)}`
const runnerPortBase = 10000 + Date.now() % 40000
const liveSnowflake = Layer.effect(Snowflake.Generator, TestClock.withLive(Snowflake.makeGenerator))

const layerFor = () =>
  layerCosmos({
    url: Redacted.make(cosmosUrl ?? ""),
    dbName: cosmosDb,
    prefix: "test-cluster-"
  })
    .pipe(
      Layer.provideMerge(liveSnowflake),
      Layer.provide(ShardingConfig.layerDefaults)
    )

describe.skipIf(!cosmosUrl)("ClusterCosmos MessageStorage", () => {
  it.effect("deduplicates keyed requests and returns the last reply", () =>
    Effect
      .gen(function*() {
        const storage = yield* MessageStorage.MessageStorage
        const shardId = testShardId("message-duplicate")
        const primaryKey = `primary/${testRunId}\\with?illegal#chars`
        const request = yield* makeStreamRequest(primaryKey, shardId)

        const saved = yield* storage.saveRequest(request)
        assert.strictEqual(saved._tag, "Success")

        const chunk = yield* makeChunkReply(request, 0)
        yield* storage.saveReply(chunk)

        const duplicateWithChunk = yield* storage.saveRequest(
          yield* makeStreamRequest(primaryKey, shardId)
        )
        assert(duplicateWithChunk._tag === "Duplicate" && Option.isSome(duplicateWithChunk.lastReceivedReply))
        assert.strictEqual(duplicateWithChunk.lastReceivedReply.value._tag, "Chunk")

        const ackChunk = yield* makeAckChunk(request, chunk)
        yield* storage.saveEnvelope(ackChunk)
        const repliesAfterAck = yield* storage.repliesFor([request])
        assert.strictEqual(repliesAfterAck.length, 0)

        yield* storage.saveReply(yield* makeStreamReply(request))
        const duplicateWithExit = yield* storage.saveRequest(
          yield* makeStreamRequest(primaryKey, shardId)
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
        assert.strictEqual((yield* storage.saveRequest(request1))._tag, "Success")
        assert.strictEqual((yield* storage.saveRequest(request2))._tag, "Success")

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

  it.effect("returns each unprocessed message to only one concurrent node poll", () =>
    Effect
      .gen(function*() {
        const storage = yield* MessageStorage.MessageStorage
        const shardId = testShardId("message-concurrent-poll")
        const expectedIds = Array.from({ length: 20 }, (_, index) => index + 1)
        const requests = yield* Effect.forEach(expectedIds, (id) => makeRequest({ payload: { id }, shardId }))
        yield* Effect.forEach(requests, (request) => storage.saveRequest(request), { discard: true })

        const polls = yield* Effect.forEach(
          Array.from({ length: 8 }, () => void 0),
          () => storage.unprocessedMessages([shardId]),
          { concurrency: "unbounded" }
        )
        const receivedIds = polls
          .flatMap((messages) => messages.map(requestPayloadId))
          .sort((a, b) => a - b)

        assert.deepStrictEqual(receivedIds, expectedIds)
        assert.strictEqual((yield* storage.unprocessedMessages([shardId])).length, 0)
      })
      .pipe(Effect.provide(layerFor())), 20000)

  it.effect("preserves terminal reply state after concurrent node polling", () =>
    Effect
      .gen(function*() {
        const storage = yield* MessageStorage.MessageStorage
        const shardId = testShardId("message-concurrent-reply")
        const primaryKey = `concurrent-reply/${testRunId}`
        const request = yield* makeStreamRequest(primaryKey, shardId)
        assert.strictEqual((yield* storage.saveRequest(request))._tag, "Success")

        const polls = yield* Effect.forEach(
          Array.from({ length: 8 }, () => void 0),
          () => storage.unprocessedMessages([shardId]),
          { concurrency: "unbounded" }
        )
        assert.strictEqual(polls.flat().length, 1)

        yield* storage.saveReply(yield* makeStreamReply(request))

        const duplicate = yield* storage.saveRequest(yield* makeStreamRequest(primaryKey, shardId))
        assert(duplicate._tag === "Duplicate" && Option.isSome(duplicate.lastReceivedReply))
        assert.strictEqual(duplicate.lastReceivedReply.value._tag, "WithExit")
      })
      .pipe(Effect.provide(layerFor())), 20000)

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

  it.effect("fails on duplicate WithExit for the same request", () =>
    Effect
      .gen(function*() {
        const storage = yield* MessageStorage.MessageStorage
        const request = yield* makeStreamRequest(`duplicate-with-exit/${testRunId}`)
        yield* storage.saveRequest(request)
        yield* storage.saveReply(yield* makeStreamReply(request))

        const duplicateAttempt = storage.saveReply(yield* makeStreamReply(request))
        const error = yield* Effect.flip(duplicateAttempt)
        assert.strictEqual(error._tag, "PersistenceError")
      })
      .pipe(Effect.provide(layerFor())))

  it.effect("fails on duplicate Chunk sequence for the same request", () =>
    Effect
      .gen(function*() {
        const storage = yield* MessageStorage.MessageStorage
        const request = yield* makeStreamRequest(`duplicate-chunk-sequence/${testRunId}`)
        yield* storage.saveRequest(request)
        yield* storage.saveReply(yield* makeChunkReply(request, 0))

        const duplicateAttempt = storage.saveReply(yield* makeChunkReply(request, 0))
        const error = yield* Effect.flip(duplicateAttempt)
        assert.strictEqual(error._tag, "PersistenceError")
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

  it.effect("preserves shard lock ownership when two runners acquire concurrently", () =>
    Effect
      .gen(function*() {
        const storage = yield* RunnerStorage.RunnerStorage
        const runnerAddress1 = testRunnerAddress(4)
        const runnerAddress2 = testRunnerAddress(5)
        const runner1 = Runner.make({
          address: runnerAddress1,
          groups: ["default"],
          weight: 1
        })
        const runner2 = Runner.make({
          address: runnerAddress2,
          groups: ["default"],
          weight: 1
        })
        const shards = Array.from({ length: 16 }, (_, index) => testShardId("runner-occ", index + 1))

        yield* storage.register(runner1, true)
        yield* storage.register(runner2, true)

        const [acquired1, acquired2] = yield* Effect.all([
          storage.acquire(runnerAddress1, shards),
          storage.acquire(runnerAddress2, shards)
        ], { concurrency: "unbounded" })
        const acquiredIds = [...acquired1, ...acquired2].map((shard) => shard.id).sort((a, b) => a - b)

        assert.deepStrictEqual(acquiredIds, shards.map((shard) => shard.id))
        assert.strictEqual(new Set(acquiredIds).size, shards.length)
        assert.deepStrictEqual(
          (yield* storage.refresh(runnerAddress1, shards)).map((shard) => shard.id).sort((a, b) => a - b),
          acquired1.map((shard) => shard.id).sort((a, b) => a - b)
        )
        assert.deepStrictEqual(
          (yield* storage.refresh(runnerAddress2, shards)).map((shard) => shard.id).sort((a, b) => a - b),
          acquired2.map((shard) => shard.id).sort((a, b) => a - b)
        )
      })
      .pipe(Effect.provide(layerFor())), 20000)

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

describe.skipIf(!cosmosUrl)("ClusterCosmos Sharding RPC", () => {
  it.effect("runs persisted entity RPCs through Cosmos-backed cluster storage", () =>
    Effect
      .gen(function*() {
        yield* TestClock.adjust(1)
        const sharding = yield* Sharding.Sharding
        const makeClient = yield* CosmosRpcEntity.client
        const entityId = `entity/${testRunId}\\with?illegal#chars`
        const shardId = sharding.getShardId(EntityId.make(entityId), testShardGroup("rpc"))
        yield* waitForShard(sharding, shardId)
        assert.isTrue(sharding.hasShardId(shardId))
        const client = makeClient(entityId)

        const user = yield* client.GetCosmosUser({ id: 42 })
        expect(user).toEqual(new CosmosRpcUser({ id: 42, name: "User 42" }))

        const primaryKey = `rpc/${testRunId}\\with?illegal#chars`
        const first = yield* client.CosmosRequestWithKey({ key: primaryKey })
        const duplicate = yield* client.CosmosRequestWithKey({ key: primaryKey })

        assert.strictEqual(first, primaryKey)
        assert.strictEqual(duplicate, primaryKey)
      })
      .pipe(Effect.provide(clusterRpcLayer("rpc"))), 20000)
})

describe.skipIf(!cosmosUrl)("ClusterCosmos Workflow", () => {
  it.live("resumes a running workflow suspended on a durable deferred", () =>
    Effect
      .gen(function*() {
        const sharding = yield* Sharding.Sharding
        const payload = { id: `deferred/${testRunId}\\with?illegal#chars` }
        const executionId = yield* CosmosDeferredWorkflow.executionId(payload)

        const fiber = yield* CosmosDeferredWorkflow.execute(payload).pipe(Effect.forkScoped)
        yield* waitForDeferredWorkflowSuspended(executionId)

        const token = yield* DurableDeferred.tokenFromPayload(CosmosDeferred, {
          workflow: CosmosDeferredWorkflow,
          payload
        })
        yield* DurableDeferred.done(CosmosDeferred, { token, exit: Exit.succeed("resolved") })
        yield* sharding.pollStorage

        const value = yield* Fiber.join(fiber).pipe(Effect.timeout(Duration.seconds(15)))
        assert.strictEqual(value, `${payload.id}:resolved`)
        assert.strictEqual(yield* waitForDeferredWorkflowComplete(executionId), `${payload.id}:resolved`)
      })
      .pipe(Effect.provide(clusterWorkflowLayer())), 30000)
})

const GetUserRpc = Rpc.make("GetUser", {
  payload: { id: Schema.Number }
})

class CosmosRpcUser extends Schema.Class<CosmosRpcUser>("CosmosRpcUser")({
  id: Schema.Number,
  name: Schema.String
}) {}

const CosmosRpcEntity = Entity
  .make("CosmosRpcEntity", [
    Rpc.make("GetCosmosUser", {
      success: CosmosRpcUser,
      payload: { id: Schema.Number }
    }),
    Rpc.make("CosmosRequestWithKey", {
      success: Schema.String,
      payload: { key: Schema.String },
      primaryKey: ({ key }) => key
    })
  ])
  .annotate(ClusterSchema.ShardGroup, () => testShardGroup("rpc"))
  .annotateRpcs(ClusterSchema.Persisted, true)

const CosmosRpcEntityLayer = CosmosRpcEntity.toLayer(
  Effect.succeed(
    CosmosRpcEntity.of({
      GetCosmosUser: (envelope) =>
        Effect.succeed(new CosmosRpcUser({ id: envelope.payload.id, name: `User ${envelope.payload.id}` })),
      CosmosRequestWithKey: (envelope) => Effect.succeed(envelope.payload.key)
    })
  )
)

const CosmosDeferred = DurableDeferred.make("ClusterCosmos/Deferred", { success: Schema.String })

const CosmosDeferredWorkflow = Workflow
  .make({
    name: "ClusterCosmos/DeferredWorkflow",
    payload: { id: Schema.String },
    success: Schema.String,
    idempotencyKey: ({ id }) => id
  })
  .annotate(ClusterSchema.ShardGroup, () => testShardGroup("workflow"))

const CosmosDeferredWorkflowLayer = CosmosDeferredWorkflow.toLayer(Effect.fnUntraced(function*({ id }) {
  const value = yield* DurableDeferred.await(CosmosDeferred)
  return `${id}:${value}`
}))

class StreamRpc extends Rpc.make("StreamTest", {
  success: RpcSchema.Stream(Schema.Void, Schema.Never),
  payload: {
    id: Schema.String
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

const makeStreamRequest = Effect.fnUntraced(function*(id: string, shardId = testShardId("stream")) {
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

const testShardGroup = (label: string) => `cluster-cosmos-${testRunId}-${label}`

const testRunnerAddress = (offset: number) => RunnerAddress.make("localhost", runnerPortBase + offset)

const runnerStatus = (
  runners: ReadonlyArray<readonly [Runner.Runner, boolean]>,
  address: RunnerAddress.RunnerAddress
) => runners.find(([runner]) => runner.address.host === address.host && runner.address.port === address.port)

const clusterRpcLayer = (label: string) => {
  const shardGroup = testShardGroup(label)
  return CosmosRpcEntityLayer.pipe(
    Layer.provideMerge(Sharding.layer),
    Layer.provide(Runners.layerNoop),
    Layer.provide(RunnerHealth.layerNoop),
    Layer.provide(layerCosmos({
      url: Redacted.make(cosmosUrl ?? ""),
      dbName: cosmosDb,
      prefix: "test-cluster-"
    })),
    Layer.provide(ShardingConfig.layer({
      runnerAddress: Option.some(testRunnerAddress(10)),
      shardsPerGroup: 1,
      availableShardGroups: [shardGroup],
      assignedShardGroups: [shardGroup],
      entityTerminationTimeout: 0,
      entityMessagePollInterval: 50,
      entityReplyPollInterval: 50,
      refreshAssignmentsInterval: 0,
      sendRetryInterval: 50
    }))
  )
}

const clusterWorkflowLayer = () =>
  CosmosDeferredWorkflowLayer.pipe(
    Layer.provideMerge(
      ClusterWorkflowEngine.layer.pipe(
        Layer.provideMerge(Sharding.layer),
        Layer.provide(Runners.layerNoop),
        Layer.provide(RunnerHealth.layerNoop),
        Layer.provide(layerCosmos({
          url: Redacted.make(cosmosUrl ?? ""),
          dbName: cosmosDb,
          prefix: "test-cluster-"
        })),
        Layer.provide(ShardingConfig.layer({
          runnerAddress: Option.some(testRunnerAddress(20)),
          shardsPerGroup: 1,
          availableShardGroups: [testShardGroup("workflow")],
          assignedShardGroups: [testShardGroup("workflow")],
          entityTerminationTimeout: 0,
          entityMessagePollInterval: 50,
          entityReplyPollInterval: 50,
          refreshAssignmentsInterval: 0,
          sendRetryInterval: 50
        }))
      )
    )
  )

const waitForDeferredWorkflowSuspended = (executionId: string) =>
  Effect.gen(function*() {
    const sharding = yield* Sharding.Sharding
    for (let i = 0; i < 100; i++) {
      yield* sharding.pollStorage
      const polled = yield* CosmosDeferredWorkflow.poll(executionId)
      if (Option.isSome(polled) && polled.value._tag === "Suspended") return
      yield* Effect.sleep(Duration.millis(100))
    }
    return yield* Effect.fail(new Error(`Workflow ${executionId} did not suspend`))
  })

const waitForDeferredWorkflowComplete = (executionId: string) =>
  Effect.gen(function*() {
    const sharding = yield* Sharding.Sharding
    for (let i = 0; i < 100; i++) {
      yield* sharding.pollStorage
      const polled = yield* CosmosDeferredWorkflow.poll(executionId)
      if (Option.isSome(polled) && polled.value._tag === "Complete") {
        const exit = polled.value.exit
        assert(Exit.isSuccess(exit))
        return exit.value
      }
      yield* Effect.sleep(Duration.millis(100))
    }
    return yield* Effect.fail(new Error(`Workflow ${executionId} did not complete`))
  })

const waitForShard = (sharding: Sharding.Sharding["Service"], shardId: ShardId.ShardId) =>
  Effect.gen(function*() {
    for (let i = 0; i < 30; i++) {
      if (sharding.hasShardId(shardId)) return
      yield* Effect.promise<void>(() => new Promise((resolve) => setTimeout(resolve, 100)))
    }
  })

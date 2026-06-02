import { assert, describe, it } from "@effect/vitest"
import { Context, Duration, Effect, Exit, Fiber, Layer, Option, Redacted, Schema } from "effect"
import { ClusterSchema, ClusterWorkflowEngine, Entity, EntityAddress, EntityId, EntityType, Envelope, Message, MessageStorage, Reply, Runner, RunnerAddress, RunnerHealth, Runners, RunnerStorage, ShardId, Sharding, ShardingConfig, Snowflake } from "effect/unstable/cluster"
import { Headers } from "effect/unstable/http"
import { Rpc, RpcSchema } from "effect/unstable/rpc"
import { DurableDeferred, Workflow } from "effect/unstable/workflow"
import { layerAzureSql, mssqlConfigFromUrl } from "../src/ClusterAzureSql.js"

const azureSqlUrl = process.env["AZURE_SQL_TEST_URL"]
const testKey = `${Date.now().toString(36)}${Math.random().toString(16).slice(2, 8)}`
const testRunId = `${Date.now()}-${process.pid}-${Math.random().toString(16).slice(2)}`
const tablePrefix = `test_azsql_${testKey}`
const runnerPortBase = 10000 + Date.now() % 40000
const liveSnowflake = Layer.effect(Snowflake.Generator, Snowflake.makeGenerator)

describe("ClusterAzureSql config", () => {
  it("parses mssql URLs", () => {
    const config = mssqlConfigFromUrl({
      url: Redacted.make(
        "mssql://user:secret@example.database.windows.net:1433/app?encrypt=true&trustServerCertificate=false&connectTimeout=7"
      )
    })

    assert.strictEqual(config.server, "example.database.windows.net")
    assert.strictEqual(config.port, 1433)
    assert.strictEqual(config.database, "app")
    assert.strictEqual(config.username, "user")
    assert.strictEqual(config.password && Redacted.value(config.password), "secret")
    assert.strictEqual(config.encrypt, true)
    assert.strictEqual(config.trustServer, false)
  })

  it("parses Azure SQL connection strings", () => {
    const config = mssqlConfigFromUrl({
      url: Redacted.make(
        "Server=tcp:example.database.windows.net,1433;Initial Catalog=app;User ID=user;Password=secret;Encrypt=True;TrustServerCertificate=False;Connection Timeout=7;"
      )
    })

    assert.strictEqual(config.server, "example.database.windows.net")
    assert.strictEqual(config.port, 1433)
    assert.strictEqual(config.database, "app")
    assert.strictEqual(config.username, "user")
    assert.strictEqual(config.password && Redacted.value(config.password), "secret")
    assert.strictEqual(config.encrypt, true)
    assert.strictEqual(config.trustServer, false)
  })
})

const layerFor = () =>
  layerAzureSql({
    url: Redacted.make(azureSqlUrl ?? ""),
    prefix: tablePrefix,
    maxConnections: 16,
    connectTimeout: Duration.seconds(15)
  })
    .pipe(
      Layer.provideMerge(liveSnowflake),
      Layer.provide(ShardingConfig.layerDefaults)
    )

describe.skipIf(!azureSqlUrl)("ClusterAzureSql MessageStorage", () => {
  it.effect("deduplicates keyed requests and returns the last reply", () =>
    Effect
      .gen(function*() {
        const storage = yield* MessageStorage.MessageStorage
        const shardId = testShardId("md")
        const primaryKey = `primary/${testRunId}/with-specials`
        const request = yield* makeStreamRequest(primaryKey, shardId)

        assert.strictEqual((yield* storage.saveRequest(request))._tag, "Success")

        const chunk = yield* makeChunkReply(request, 0)
        yield* storage.saveReply(chunk)

        const duplicateWithChunk = yield* storage.saveRequest(yield* makeStreamRequest(primaryKey, shardId))
        assert(duplicateWithChunk._tag === "Duplicate" && Option.isSome(duplicateWithChunk.lastReceivedReply))
        assert.strictEqual(duplicateWithChunk.lastReceivedReply.value._tag, "Chunk")

        yield* storage.saveEnvelope(yield* makeAckChunk(request, chunk))
        assert.strictEqual((yield* storage.repliesFor([request])).length, 0)

        yield* storage.saveReply(yield* makeStreamReply(request))
        const duplicateWithExit = yield* storage.saveRequest(yield* makeStreamRequest(primaryKey, shardId))
        assert(duplicateWithExit._tag === "Duplicate" && Option.isSome(duplicateWithExit.lastReceivedReply))
        assert.strictEqual(duplicateWithExit.lastReceivedReply.value._tag, "WithExit")
      })
      .pipe(Effect.provide(layerFor())), 20000)

  it.effect("returns each unprocessed message to only one concurrent poll", () =>
    Effect
      .gen(function*() {
        const storage = yield* MessageStorage.MessageStorage
        const shardId = testShardId("mp")
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

  it.effect("fails on duplicate terminal replies", () =>
    Effect
      .gen(function*() {
        const storage = yield* MessageStorage.MessageStorage
        const request = yield* makeStreamRequest(`duplicate-with-exit/${testRunId}`)
        yield* storage.saveRequest(request)
        yield* storage.saveReply(yield* makeStreamReply(request))

        const error = yield* Effect.flip(storage.saveReply(yield* makeStreamReply(request)))
        assert.strictEqual(error._tag, "PersistenceError")

        const duplicate = yield* storage.saveRequest(yield* makeStreamRequest(`duplicate-with-exit/${testRunId}`))
        assert(duplicate._tag === "Duplicate" && Option.isSome(duplicate.lastReceivedReply))
        assert.strictEqual(duplicate.lastReceivedReply.value._tag, "WithExit")
        assert.strictEqual((yield* storage.unprocessedMessagesById([request.envelope.requestId])).length, 0)
      })
      .pipe(Effect.provide(layerFor())), 20000)

  it.effect("fails on duplicate chunk sequence", () =>
    Effect
      .gen(function*() {
        const storage = yield* MessageStorage.MessageStorage
        const request = yield* makeStreamRequest(`duplicate-chunk-sequence/${testRunId}`)
        yield* storage.saveRequest(request)
        yield* storage.saveReply(yield* makeChunkReply(request, 0))

        const error = yield* Effect.flip(storage.saveReply(yield* makeChunkReply(request, 0)))
        assert.strictEqual(error._tag, "PersistenceError")
        assert.strictEqual((yield* storage.repliesFor([request])).length, 1)
      })
      .pipe(Effect.provide(layerFor())), 20000)

  it.effect("returns only the request by id after an acked chunk", () =>
    Effect
      .gen(function*() {
        const storage = yield* MessageStorage.MessageStorage
        const request = yield* makeStreamRequest(`ack-by-id/${testRunId}`, testShardId("ak"))
        yield* storage.saveRequest(request)

        const chunk = yield* makeChunkReply(request, 0)
        yield* storage.saveReply(chunk)
        yield* storage.saveEnvelope(yield* makeAckChunk(request, chunk))

        const messages = yield* storage.unprocessedMessagesById([request.envelope.requestId])
        assert.strictEqual(messages.length, 1)
        assert.strictEqual(messages[0]?.envelope._tag, "Request")
        assert.strictEqual(messages[0]?.envelope.requestId, request.envelope.requestId)
      })
      .pipe(Effect.provide(layerFor())), 20000)

  it.effect("clears terminal replies and makes the request processable again", () =>
    Effect
      .gen(function*() {
        const storage = yield* MessageStorage.MessageStorage
        const request = yield* makeStreamRequest(`clear-replies/${testRunId}`, testShardId("cr"))
        yield* storage.saveRequest(request)
        yield* storage.saveReply(yield* makeStreamReply(request))

        assert.strictEqual((yield* storage.unprocessedMessagesById([request.envelope.requestId])).length, 0)
        assert.strictEqual((yield* storage.repliesFor([request])).length, 1)

        yield* storage.clearReplies(request.envelope.requestId)

        const messages = yield* storage.unprocessedMessagesById([request.envelope.requestId])
        assert.strictEqual(messages.length, 1)
        assert.strictEqual(messages[0]?.envelope._tag, "Request")
        assert.strictEqual((yield* storage.repliesFor([request])).length, 0)
      })
      .pipe(Effect.provide(layerFor())), 20000)

  it.effect("clears all message and reply state for an address", () =>
    Effect
      .gen(function*() {
        const storage = yield* MessageStorage.MessageStorage
        const primaryKey = `clear-address/${testRunId}`
        const request = yield* makeStreamRequest(primaryKey, testShardId("ca"), EntityId.make(`clear-${testRunId}`))
        yield* storage.saveRequest(request)
        yield* storage.saveReply(yield* makeChunkReply(request, 0))
        yield* storage.saveReply(yield* makeStreamReply(request))

        yield* storage.clearAddress(request.envelope.address)

        assert.strictEqual((yield* storage.unprocessedMessagesById([request.envelope.requestId])).length, 0)
        assert.strictEqual((yield* storage.repliesForUnfiltered([request.envelope.requestId])).length, 0)
        assert.isTrue(Option.isNone(
          yield* storage.requestIdForPrimaryKey({
            address: request.envelope.address,
            tag: request.envelope.tag,
            id: primaryKey
          })
        ))
      })
      .pipe(Effect.provide(layerFor())), 20000)
})

describe.skipIf(!azureSqlUrl)("ClusterAzureSql RunnerStorage", () => {
  it.effect("registers runners and tracks health", () =>
    Effect
      .gen(function*() {
        const storage = yield* RunnerStorage.RunnerStorage
        const runnerAddress = testRunnerAddress(1)
        const runner = Runner.make({ address: runnerAddress, groups: ["default"], weight: 1 })

        const machineId1 = yield* storage.register(runner, true)
        const machineId2 = yield* storage.register(runner, true)
        assert.deepStrictEqual(machineId2, machineId1)
        assert.deepStrictEqual(runnerStatus(yield* storage.getRunners, runnerAddress), [runner, true])

        yield* storage.setRunnerHealth(runnerAddress, false)
        assert.deepStrictEqual(runnerStatus(yield* storage.getRunners, runnerAddress), [runner, false])

        yield* storage.unregister(runnerAddress)
        assert.strictEqual(runnerStatus(yield* storage.getRunners, runnerAddress), undefined)
      })
      .pipe(Effect.provide(layerFor())), 20000)

  it.effect("preserves shard lock ownership when two runners acquire concurrently", () =>
    Effect
      .gen(function*() {
        const storage = yield* RunnerStorage.RunnerStorage
        const runnerAddress1 = testRunnerAddress(2)
        const runnerAddress2 = testRunnerAddress(3)
        const runner1 = Runner.make({ address: runnerAddress1, groups: ["default"], weight: 1 })
        const runner2 = Runner.make({ address: runnerAddress2, groups: ["default"], weight: 1 })
        const shards = Array.from({ length: 16 }, (_, index) => testShardId("ro", index + 1))

        yield* storage.register(runner1, true)
        yield* storage.register(runner2, true)

        const [acquired1, acquired2] = yield* Effect.all([
          storage.acquire(runnerAddress1, shards),
          storage.acquire(runnerAddress2, shards)
        ], { concurrency: "unbounded" })
        const acquiredIds = [...acquired1, ...acquired2].map((shard) => shard.id).sort((a, b) => a - b)

        assert.deepStrictEqual(acquiredIds, shards.map((shard) => shard.id))
        assert.strictEqual(new Set(acquiredIds).size, shards.length)
      })
      .pipe(Effect.provide(layerFor())), 20000)

  it.effect("acquires, refreshes, releases, and re-acquires shard locks", () =>
    Effect
      .gen(function*() {
        const storage = yield* RunnerStorage.RunnerStorage
        const runnerAddress1 = testRunnerAddress(4)
        const runnerAddress2 = testRunnerAddress(5)
        const shards = [
          testShardId("rr", 1),
          testShardId("rr", 2),
          testShardId("rr", 3)
        ]

        assert.deepStrictEqual((yield* storage.acquire(runnerAddress1, shards)).map((shard) => shard.id), [1, 2, 3])
        assert.deepStrictEqual((yield* storage.acquire(runnerAddress2, shards)).map((shard) => shard.id), [])
        assert.deepStrictEqual((yield* storage.refresh(runnerAddress1, shards)).map((shard) => shard.id), [1, 2, 3])

        yield* storage.release(runnerAddress1, testShardId("rr", 2))
        assert.deepStrictEqual((yield* storage.acquire(runnerAddress2, shards)).map((shard) => shard.id), [2])

        yield* storage.releaseAll(runnerAddress1)
        assert.deepStrictEqual((yield* storage.acquire(runnerAddress2, shards)).map((shard) => shard.id), [1, 2, 3])
      })
      .pipe(Effect.provide(layerFor())), 20000)
})

describe.skipIf(!azureSqlUrl)("ClusterAzureSql Sharding RPC", () => {
  it.effect("runs persisted entity RPCs through Azure SQL-backed cluster storage", () =>
    Effect
      .gen(function*() {
        const sharding = yield* Sharding.Sharding
        const makeClient = yield* AzureSqlRpcEntity.client
        const entityId = `entity-${testRunId}`
        const shardId = sharding.getShardId(EntityId.make(entityId), testShardGroup("rpc"))
        yield* waitForShard(sharding, shardId)
        assert.isTrue(sharding.hasShardId(shardId))

        const client = makeClient(entityId)
        const user = yield* client.GetAzureSqlUser({ id: 42 })
        assert.deepStrictEqual(user, new AzureSqlRpcUser({ id: 42, name: "User 42" }))

        const primaryKey = `rpc/${testRunId}`
        assert.strictEqual(yield* client.AzureSqlRequestWithKey({ key: primaryKey }), primaryKey)
        assert.strictEqual(yield* client.AzureSqlRequestWithKey({ key: primaryKey }), primaryKey)
      })
      .pipe(Effect.provide(clusterRpcLayer("rpc"))), 30000)
})

describe.skipIf(!azureSqlUrl)("ClusterAzureSql Workflow", () => {
  it.live("resumes a running workflow suspended on a durable deferred", () =>
    Effect
      .gen(function*() {
        const sharding = yield* Sharding.Sharding
        const payload = { id: `deferred-${testRunId}` }
        const executionId = yield* AzureSqlDeferredWorkflow.executionId(payload)

        const fiber = yield* AzureSqlDeferredWorkflow.execute(payload).pipe(Effect.forkScoped)
        yield* waitForDeferredWorkflowSuspended(executionId)

        const token = yield* DurableDeferred.tokenFromPayload(AzureSqlDeferred, {
          workflow: AzureSqlDeferredWorkflow,
          payload
        })
        yield* DurableDeferred.done(AzureSqlDeferred, { token, exit: Exit.succeed("resolved") })
        yield* sharding.pollStorage

        const value = yield* Fiber.join(fiber).pipe(Effect.timeout(Duration.seconds(15)))
        assert.strictEqual(value, `${payload.id}:resolved`)
        assert.strictEqual(yield* waitForDeferredWorkflowComplete(executionId), `${payload.id}:resolved`)
      })
      .pipe(Effect.provide(clusterWorkflowLayer())), 30000)
})

const GetUserRpc = Rpc.make("AzureSqlGetUser", {
  payload: { id: Schema.Number }
})

class AzureSqlRpcUser extends Schema.Class<AzureSqlRpcUser>("AzureSqlRpcUser")({
  id: Schema.Number,
  name: Schema.String
}) {}

const AzureSqlRpcEntity = Entity
  .make("AzureSqlRpcEntity", [
    Rpc.make("GetAzureSqlUser", {
      success: AzureSqlRpcUser,
      payload: { id: Schema.Number }
    }),
    Rpc.make("AzureSqlRequestWithKey", {
      success: Schema.String,
      payload: { key: Schema.String },
      primaryKey: ({ key }) => key
    })
  ])
  .annotate(ClusterSchema.ShardGroup, () => testShardGroup("rpc"))
  .annotateRpcs(ClusterSchema.Persisted, true)

const AzureSqlRpcEntityLayer = AzureSqlRpcEntity.toLayer(
  Effect.succeed(
    AzureSqlRpcEntity.of({
      GetAzureSqlUser: (envelope) =>
        Effect.succeed(new AzureSqlRpcUser({ id: envelope.payload.id, name: `User ${envelope.payload.id}` })),
      AzureSqlRequestWithKey: (envelope) => Effect.succeed(envelope.payload.key)
    })
  )
)

const AzureSqlDeferred = DurableDeferred.make("ClusterAzureSql/Deferred", { success: Schema.String })

const AzureSqlDeferredWorkflow = Workflow
  .make({
    name: "ClusterAzureSql/DeferredWorkflow",
    payload: { id: Schema.String },
    success: Schema.String,
    idempotencyKey: ({ id }) => id
  })
  .annotate(ClusterSchema.ShardGroup, () => testShardGroup("wf"))

const AzureSqlDeferredWorkflowLayer = AzureSqlDeferredWorkflow.toLayer(Effect.fnUntraced(function*({ id }) {
  const value = yield* DurableDeferred.await(AzureSqlDeferred)
  return `${id}:${value}`
}))

class StreamRpc extends Rpc.make("AzureSqlStreamTest", {
  success: RpcSchema.Stream(Schema.Void, Schema.Never),
  payload: { id: Schema.String },
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
        shardId: options?.shardId ?? testShardId("df"),
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

const makeStreamRequest = Effect.fnUntraced(function*(
  id: string,
  shardId = testShardId("st"),
  entityId = EntityId.make("1")
) {
  const snowflake = yield* Snowflake.Generator
  return new Message.OutgoingRequest({
    envelope: Envelope.makeRequest<typeof StreamRpc>({
      requestId: snowflake.nextUnsafe(),
      address: EntityAddress.make({
        shardId,
        entityType: EntityType.make("test"),
        entityId
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
    throw new Error("Expected Request envelope")
  }
  const envelope = message.envelope
  assert(typeof envelope.payload === "object" && envelope.payload !== null)
  assert("id" in envelope.payload)
  assert.strictEqual(typeof envelope.payload.id, "number")
  return envelope.payload.id
}

const testShardId = (label: string, id = 1) => ShardId.make(testShardGroup(label), id)

const testShardGroup = (label: string) => `az${testKey}${label}`

const testRunnerAddress = (offset: number) => RunnerAddress.make("localhost", runnerPortBase + offset)

const runnerStatus = (
  runners: ReadonlyArray<readonly [Runner.Runner, boolean]>,
  address: RunnerAddress.RunnerAddress
) => runners.find(([runner]) => runner.address.host === address.host && runner.address.port === address.port)

const clusterRpcLayer = (label: string) => {
  const shardGroup = testShardGroup(label)
  return AzureSqlRpcEntityLayer.pipe(
    Layer.provideMerge(Sharding.layer),
    Layer.provide(Runners.layerNoop),
    Layer.provide(RunnerHealth.layerNoop),
    Layer.provide(layerAzureSql({
      url: Redacted.make(azureSqlUrl ?? ""),
      prefix: tablePrefix,
      maxConnections: 16,
      connectTimeout: Duration.seconds(15)
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
  AzureSqlDeferredWorkflowLayer.pipe(
    Layer.provideMerge(
      ClusterWorkflowEngine.layer.pipe(
        Layer.provideMerge(Sharding.layer),
        Layer.provide(Runners.layerNoop),
        Layer.provide(RunnerHealth.layerNoop),
        Layer.provide(layerAzureSql({
          url: Redacted.make(azureSqlUrl ?? ""),
          prefix: tablePrefix,
          maxConnections: 16,
          connectTimeout: Duration.seconds(15)
        })),
        Layer.provide(ShardingConfig.layer({
          runnerAddress: Option.some(testRunnerAddress(20)),
          shardsPerGroup: 1,
          availableShardGroups: [testShardGroup("wf")],
          assignedShardGroups: [testShardGroup("wf")],
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
      const polled = yield* AzureSqlDeferredWorkflow.poll(executionId)
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
      const polled = yield* AzureSqlDeferredWorkflow.poll(executionId)
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
      yield* Effect.sleep(Duration.millis(100))
    }
  })

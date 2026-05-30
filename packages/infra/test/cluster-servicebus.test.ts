import type { ServiceBusMessage, ServiceBusReceiverOptions } from "@azure/service-bus"
import { assert, describe, it } from "@effect/vitest"
import { Context, Effect, Layer, Option, Schema, Stream } from "effect"
import { ClusterSchema, EntityAddress, EntityId, EntityType, Envelope, Message, MessageStorage, Runners, ShardId, Sharding, ShardingConfig, Snowflake } from "effect/unstable/cluster"
import { Headers } from "effect/unstable/http"
import { Rpc } from "effect/unstable/rpc"
import { type ClusterServiceBusClient, layerClientFrom, layerRunners, makeStoragePoller } from "../src/ClusterServiceBus.js"

describe("ClusterServiceBus", () => {
  it.effect("wakes storage polling from topic notifications", () =>
    Effect.gen(function*() {
      let processMessage: (() => Promise<void>) | undefined
      let polls = 0
      let receiverClosed = false
      let subscriptionClosed = false

      const client: ClusterServiceBusClient = {
        createSender() {
          throw new Error("unused")
        },
        createReceiver(topicName: string, subscriptionName: string, options?: ServiceBusReceiverOptions) {
          assert.strictEqual(topicName, "cluster-notifications")
          assert.strictEqual(subscriptionName, "runner-a")
          assert.strictEqual(options?.receiveMode, "receiveAndDelete")
          return {
            subscribe(handlers) {
              processMessage = handlers.processMessage
              return {
                close() {
                  subscriptionClosed = true
                  return Promise.resolve()
                }
              }
            },
            close() {
              receiverClosed = true
              return Promise.resolve()
            }
          }
        },
        close() {
          return Promise.resolve()
        }
      }

      const sharding = Sharding.Sharding.of({
        activeEntityCount: Effect.succeed(0),
        getRegistrationEvents: Stream.empty,
        getShardId: () => ShardId.make("cluster-servicebus", 0),
        getSnowflake: Effect.succeed(Snowflake.Snowflake(1n)),
        hasShardId: () => false,
        isShutdown: Effect.succeed(false),
        makeClient: () => Effect.die("unused"),
        notify: () => Effect.void,
        pollStorage: Effect.sync(() => {
          polls++
        }),
        registerEntity: () => Effect.void,
        registerSingleton: () => Effect.void,
        reset: () => Effect.succeed(false),
        send: () => Effect.void,
        sendOutgoing: () => Effect.void
      })

      yield* Effect
        .scoped(
          makeStoragePoller({
            topicName: "cluster-notifications",
            subscriptionName: "runner-a"
          })
            .pipe(
              Effect.andThen(
                Effect.gen(function*() {
                  if (processMessage === undefined) {
                    return yield* Effect.die("missing Service Bus subscription")
                  }
                  const runProcessMessage = processMessage
                  yield* Effect.promise(() => runProcessMessage())
                  assert.strictEqual(polls, 1)
                })
              )
            )
        )
        .pipe(
          Effect.provide(layerClientFrom(client)),
          Effect.provide(Layer.succeed(Sharding.Sharding)(sharding))
        )

      assert.strictEqual(subscriptionClosed, true)
      assert.strictEqual(receiverClosed, true)
    }))

  it.effect("publishes persisted storage notifications", () =>
    Effect.gen(function*() {
      const sent: Array<ServiceBusMessage> = []
      let senderClosed = false

      const client: ClusterServiceBusClient = {
        createSender(topicName) {
          assert.strictEqual(topicName, "cluster-notifications")
          return {
            sendMessages(message) {
              sent.push(message)
              return Promise.resolve()
            },
            close() {
              senderClosed = true
              return Promise.resolve()
            }
          }
        },
        createReceiver() {
          throw new Error("unused")
        },
        close() {
          return Promise.resolve()
        }
      }

      yield* Effect.scoped(
        Effect
          .gen(function*() {
            const runners = yield* Runners.Runners
            yield* runners.notify({
              address: Option.none(),
              discard: true,
              message: yield* makeOutgoingRequest
            })
          })
          .pipe(
            Effect.provide(layerRunners({ topicName: "cluster-notifications" })),
            Effect.provide(layerClientFrom(client)),
            Effect.provide(MessageStorage.layerNoop),
            Effect.provide(ShardingConfig.layerDefaults)
          )
      )

      assert.strictEqual(senderClosed, true)
      assert.strictEqual(sent.length, 1)
      assert.deepStrictEqual(sent[0]?.body, {
        _tag: "EffectClusterStorageNotification",
        envelopeId: "1",
        requestId: "1",
        shardId: "cluster-servicebus:1",
        entityType: "TestEntity",
        entityId: "entity-1"
      })
      assert.strictEqual(sent[0]?.contentType, "application/json")
      assert.strictEqual(sent[0]?.correlationId, "1")
      assert.strictEqual(sent[0]?.messageId, "1")
      assert.strictEqual(sent[0]?.subject, "EffectClusterStorageNotification")
    }))
})

const TestRpc = Rpc
  .make("TestRpc", {
    payload: { id: Schema.Number }
  })
  .annotate(ClusterSchema.Persisted, true)

const makeOutgoingRequest = Effect.sync(() =>
  new Message.OutgoingRequest({
    annotations: TestRpc.annotations,
    context: Context.empty(),
    envelope: Envelope.makeRequest<typeof TestRpc>({
      address: EntityAddress.make({
        entityId: EntityId.make("entity-1"),
        entityType: EntityType.make("TestEntity"),
        shardId: ShardId.make("cluster-servicebus", 1)
      }),
      headers: Headers.empty,
      payload: { id: 1 },
      requestId: Snowflake.Snowflake(1n),
      tag: TestRpc._tag
    }),
    lastReceivedReply: Option.none(),
    respond: () => Effect.void,
    rpc: TestRpc
  })
)

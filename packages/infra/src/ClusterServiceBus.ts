import { ServiceBusClient, type ServiceBusClientOptions, type ServiceBusMessage, type ServiceBusReceiverOptions, type ServiceBusSenderOptions, type SubscribeOptions } from "@azure/service-bus"
import * as Context from "effect-app/Context"
import * as Effect from "effect-app/Effect"
import * as Layer from "effect-app/Layer"
import * as Data from "effect/Data"
import * as Scope from "effect/Scope"
import * as ClusterError from "effect/unstable/cluster/ClusterError"
import { Persisted } from "effect/unstable/cluster/ClusterSchema"
import type * as Message from "effect/unstable/cluster/Message"
import type * as MessageStorage from "effect/unstable/cluster/MessageStorage"
import type * as RunnerHealth from "effect/unstable/cluster/RunnerHealth"
import * as Runners from "effect/unstable/cluster/Runners"
import type * as RunnerStorage from "effect/unstable/cluster/RunnerStorage"
import * as Sharding from "effect/unstable/cluster/Sharding"
import type * as ShardingConfig from "effect/unstable/cluster/ShardingConfig"
import * as Snowflake from "effect/unstable/cluster/Snowflake"
import type * as Rpc from "effect/unstable/rpc/Rpc"

export interface ClusterServiceBusSender {
  readonly sendMessages: (messages: ServiceBusMessage) => Promise<void>
  readonly close: () => Promise<void>
}

export interface ClusterServiceBusSubscription {
  readonly close: () => Promise<void>
}

export interface ClusterServiceBusReceiver {
  readonly subscribe: (
    handlers: {
      readonly processMessage: () => Promise<void>
      readonly processError: (args: {
        readonly error: Error
        readonly entityPath?: string | undefined
        readonly errorSource: string
        readonly fullyQualifiedNamespace: string
      }) => Promise<void>
    },
    options?: SubscribeOptions | undefined
  ) => ClusterServiceBusSubscription
  readonly close: () => Promise<void>
}

export interface ClusterServiceBusClient {
  readonly createSender: (
    topicName: string,
    options?: ServiceBusSenderOptions | undefined
  ) => ClusterServiceBusSender
  readonly createReceiver: (
    topicName: string,
    subscriptionName: string,
    options?: ServiceBusReceiverOptions | undefined
  ) => ClusterServiceBusReceiver
  readonly close: () => Promise<void>
}

export class ClusterServiceBus extends Context.Service<ClusterServiceBus, {
  readonly client: ClusterServiceBusClient
}>()("@effect-app/infra/ClusterServiceBus") {}

export interface TopicOptions {
  readonly topicName: string
  readonly senderOptions?: ServiceBusSenderOptions | undefined
}

export interface SubscriptionOptions extends TopicOptions {
  readonly subscriptionName: string
  readonly receiverOptions?: ServiceBusReceiverOptions | undefined
  readonly subscribeOptions?: SubscribeOptions | undefined
}

export interface StorageNotification {
  readonly _tag: "EffectClusterStorageNotification"
  readonly envelopeId: string
  readonly requestId: string
  readonly shardId: string
  readonly entityType: string
  readonly entityId: string
}

export const layerClient = (
  connectionString: string,
  options?: ServiceBusClientOptions | undefined
): Layer.Layer<ClusterServiceBus> =>
  Layer.effect(
    ClusterServiceBus,
    Effect.acquireRelease(
      Effect.sync(() => ClusterServiceBus.of({ client: new ServiceBusClient(connectionString, options) })),
      ({ client }) => Effect.promise(() => client.close()).pipe(Effect.ignore)
    )
  )

export const layerClientFrom = (client: ClusterServiceBusClient): Layer.Layer<ClusterServiceBus> =>
  Layer.succeed(ClusterServiceBus)(ClusterServiceBus.of({ client }))

export const makeRunners: (
  options: TopicOptions
) => Effect.Effect<
  Runners.Runners["Service"],
  never,
  | ClusterServiceBus
  | MessageStorage.MessageStorage
  | ShardingConfig.ShardingConfig
  | Snowflake.Generator
  | Scope.Scope
> = Effect.fnUntraced(function*(options) {
  const serviceBus = yield* ClusterServiceBus
  const scope = yield* Effect.scope
  const sender = serviceBus.client.createSender(options.topicName, options.senderOptions)

  yield* Scope.addFinalizer(scope, Effect.promise(() => sender.close()).pipe(Effect.ignore))

  const publish = <R extends Rpc.Any>(message: Message.Outgoing<R>) =>
    Effect
      .tryPromise({
        try: () => sender.sendMessages(storageNotification(message)),
        catch: (cause) => new ServiceBusPublishError({ cause })
      })
      .pipe(
        Effect.catch((cause) => Effect.logDebug("Could not publish cluster storage notification", cause))
      )

  return yield* Runners.make({
    ping: (address) => Effect.fail(new ClusterError.RunnerUnavailable({ address })),
    send: ({ address, message }) => {
      const persisted = Context.get(message.rpc.annotations, Persisted)
      return (persisted ? publish(message) : Effect.void).pipe(
        Effect.andThen(Effect.fail(new ClusterError.RunnerUnavailable({ address })))
      )
    },
    notify: ({ message }) => publish(message),
    onRunnerUnavailable: () => Effect.void
  })
})

export const layerRunners = (
  options: TopicOptions
): Layer.Layer<
  Runners.Runners,
  never,
  ClusterServiceBus | MessageStorage.MessageStorage | ShardingConfig.ShardingConfig
> =>
  Layer.effect(Runners.Runners, makeRunners(options)).pipe(
    Layer.provide(Snowflake.layerGenerator)
  )

export const makeStoragePoller: (
  options: SubscriptionOptions
) => Effect.Effect<void, never, ClusterServiceBus | Sharding.Sharding | Scope.Scope> = Effect.fnUntraced(
  function*(options) {
    const serviceBus = yield* ClusterServiceBus
    const sharding = yield* Sharding.Sharding
    const scope = yield* Effect.scope
    const receiver = serviceBus.client.createReceiver(
      options.topicName,
      options.subscriptionName,
      {
        receiveMode: "receiveAndDelete",
        ...options.receiverOptions
      }
    )
    const subscription = receiver.subscribe(
      {
        processMessage: () =>
          Effect.runPromise(
            sharding.pollStorage.pipe(
              Effect.catchCause((cause) => Effect.logDebug("Could not wake cluster storage poller", cause))
            )
          ),
        processError: (args) =>
          Effect.runPromise(
            Effect.logDebug("Error receiving cluster storage notification", args.error).pipe(
              Effect.annotateLogs({
                entityPath: args.entityPath,
                errorSource: args.errorSource,
                fullyQualifiedNamespace: args.fullyQualifiedNamespace
              })
            )
          )
      },
      options.subscribeOptions
    )

    yield* Scope.addFinalizer(
      scope,
      Effect.promise(() => subscription.close()).pipe(
        Effect.andThen(Effect.promise(() => receiver.close())),
        Effect.ignore
      )
    )
  }
)

export const layerStoragePoller = (
  options: SubscriptionOptions
): Layer.Layer<never, never, ClusterServiceBus | Sharding.Sharding> => Layer.effectDiscard(makeStoragePoller(options))

export const layer = (
  options: SubscriptionOptions
): Layer.Layer<
  Sharding.Sharding | Runners.Runners,
  never,
  | ClusterServiceBus
  | MessageStorage.MessageStorage
  | RunnerHealth.RunnerHealth
  | RunnerStorage.RunnerStorage
  | ShardingConfig.ShardingConfig
> => {
  const sharding = Sharding.layer.pipe(
    Layer.provideMerge(layerRunners(options))
  )
  return Layer.merge(
    sharding,
    layerStoragePoller(options).pipe(
      Layer.provide(sharding)
    )
  )
}

const storageNotification = <R extends Rpc.Any>(message: Message.Outgoing<R>): ServiceBusMessage => {
  const envelope = message.envelope
  const envelopeId = envelope._tag === "Request" ? envelope.requestId : envelope.id
  const body: StorageNotification = {
    _tag: "EffectClusterStorageNotification",
    envelopeId: String(envelopeId),
    requestId: String(envelope.requestId),
    shardId: envelope.address.shardId.toString(),
    entityType: envelope.address.entityType,
    entityId: envelope.address.entityId
  }
  return {
    body,
    contentType: "application/json",
    correlationId: body.requestId,
    messageId: body.envelopeId,
    subject: body._tag
  }
}

class ServiceBusPublishError extends Data.TaggedError("ServiceBusPublishError")<{
  readonly cause: unknown
}> {}

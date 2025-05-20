/* eslint-disable @typescript-eslint/prefer-promise-reject-errors */
import { type OperationOptionsBase, type ProcessErrorArgs, ServiceBusClient, type ServiceBusMessage, type ServiceBusMessageBatch, type ServiceBusReceivedMessage, type ServiceBusReceiver, type ServiceBusSender } from "@azure/service-bus"
import { Cause, Context, Effect, Exit, FiberSet, Layer, type Scope } from "effect-app"
import { InfraLogger } from "../logger.js"

const withSpanAndLog = (name: string) => <A, E, R>(self: Effect<A, E, R>) =>
  Effect.logInfo(name).pipe(
    Effect.zipRight(self),
    Effect.tap(Effect.logInfo(name + " done")),
    Effect.withLogSpan(name),
    Effect.withSpan(name)
  )

function makeClient(url: string) {
  return Effect.acquireRelease(
    Effect.sync(() => new ServiceBusClient(url)).pipe(withSpanAndLog("ServiceBus.client.create")),
    (client) => Effect.promise(() => client.close()).pipe(withSpanAndLog("ServiceBus.client.close"))
  )
}

const Client = Context.GenericTag<ServiceBusClient>("@services/Client")
export const LiveServiceBusClient = (url: string) => Layer.scoped(Client)(makeClient(url))

function makeSender(queueName: string) {
  return Effect.gen(function*() {
    const serviceBusClient = yield* Client

    return yield* Effect.acquireRelease(
      Effect.sync(() => serviceBusClient.createSender(queueName)).pipe(
        withSpanAndLog(`ServiceBus.sender.create ${queueName}`)
      ),
      (sender) => Effect.promise(() => sender.close()).pipe(withSpanAndLog(`ServiceBus.sender.close ${queueName}`))
    )
  })
}
export const Sender = Context.GenericTag<ServiceBusSender>("@services/Sender")

export function LiveSender(queueName: string) {
  return Layer
    .scoped(Sender, makeSender(queueName))
}

function makeQueueReceiver(queueName: string, waitTillEmpty: Effect<void>, sessionId?: string) {
  return Effect.gen(function*() {
    const serviceBusClient = yield* Client

    return yield* Effect.acquireRelease(
      (sessionId
        ? Effect.promise(() => serviceBusClient.acceptSession(queueName, sessionId))
        : Effect.sync(() => serviceBusClient.createReceiver(queueName)))
        .pipe(withSpanAndLog(`ServiceBus.receiver.create ${queueName}.${sessionId}`)),
      (r) =>
        waitTillEmpty.pipe(
          withSpanAndLog(`ServiceBus.receiver.waitTillEmpty ${queueName}.${sessionId}`),
          Effect.andThen(
            Effect.promise(() => r.close()).pipe(withSpanAndLog(`ServiceBus.receiver.close ${queueName}.${sessionId}`))
          ),
          withSpanAndLog(`ServiceBus.receiver.release ${queueName}.${sessionId}`)
        )
    )
  })
}

function makeTopicReceiver(
  topicName: string,
  subscriptionName: string,
  waitTillEmpty: Effect<void>,
  sessionId?: string
) {
  return Effect.gen(function*() {
    const serviceBusClient = yield* Client

    return yield* Effect.acquireRelease(
      (sessionId
        ? Effect.promise(() => serviceBusClient.acceptSession(topicName, subscriptionName, sessionId))
        : Effect.sync(() => serviceBusClient.createReceiver(topicName, subscriptionName)))
        .pipe(withSpanAndLog(`ServiceBus.receiver.create ${topicName}/${subscriptionName}.${sessionId}`)),
      (r) =>
        waitTillEmpty.pipe(
          withSpanAndLog(`ServiceBus.receiver.waitTillEmpty ${topicName}/${subscriptionName}.${sessionId}`),
          Effect.andThen(
            Effect.promise(() => r.close()).pipe(
              withSpanAndLog(`ServiceBus.receiver.close ${topicName}/${subscriptionName}.${sessionId}`)
            )
          ),
          withSpanAndLog(`ServiceBus.receiver.release ${topicName}/${subscriptionName}.${sessionId}`)
        )
    )
  })
}

export class ServiceBusReceiverFactory extends Context.TagId(
  "ServiceBusReceiverFactory"
)<ServiceBusReceiverFactory, {
  make: (waitTillEmpty: Effect<void>) => Effect<ServiceBusReceiver, never, Scope>
  makeSession: (sessionId: string, waitTillEmpty: Effect<void>) => Effect<ServiceBusReceiver, never, Scope>
  makeTopic: (subscriptionName: string, waitTillEmpty: Effect<void>) => Effect<ServiceBusReceiver, never, Scope>
  makeTopicSession: (
    subscriptionName: string,
    sessionId: string,
    waitTillEmpty: Effect<void>
  ) => Effect<ServiceBusReceiver, never, Scope>
}>() {
  static readonly Live = (queueName: string) =>
    this.toLayer(Client.pipe(Effect.andThen((cl) => ({
      make: (waitTillEmpty: Effect<void>) =>
        makeQueueReceiver(queueName, waitTillEmpty).pipe(Effect.provideService(Client, cl)),
      makeSession: (sessionId: string, waitTillEmpty: Effect<void>) =>
        makeQueueReceiver(queueName, waitTillEmpty, sessionId).pipe(
          Effect.provideService(Client, cl)
        ),
      makeTopic: (subscriptionName: string, waitTillEmpty: Effect<void>) =>
        makeTopicReceiver(queueName, subscriptionName, waitTillEmpty).pipe(Effect.provideService(Client, cl)),
      makeTopicSession: (subscriptionName: string, sessionId: string, waitTillEmpty: Effect<void>) =>
        makeTopicReceiver(queueName, subscriptionName, waitTillEmpty, sessionId).pipe(Effect.provideService(Client, cl))
    }))))
}

export function sendMessages(
  messages: ServiceBusMessage | ServiceBusMessage[] | ServiceBusMessageBatch,
  options?: OperationOptionsBase
) {
  return Effect.gen(function*() {
    const s = yield* Sender
    return yield* Effect.promise(() => s.sendMessages(messages, options))
  })
}

export function subscribe<RMsg, RErr>(hndlr: MessageHandlers<RMsg, RErr>, sessionId?: string) {
  return Effect.gen(function*() {
    const rf = yield* ServiceBusReceiverFactory
    const fs = yield* FiberSet.make()
    const fr = yield* FiberSet.runtime(fs)<RMsg | RErr>()
    const wait = Effect
      .gen(function*() {
        if ((yield* FiberSet.size(fs)) > 0) {
          yield* InfraLogger.logDebug("Waiting ServiceBusFiberSet to be empty: " + (yield* FiberSet.size(fs)))
        }
        while ((yield* FiberSet.size(fs)) > 0) yield* Effect.sleep("250 millis")
      })
      .pipe(Effect.delay("10 seconds")) // TODO: just for testing
    const r = yield* sessionId
      ? rf.makeSession(
        sessionId,
        wait
      )
      : rf.make(wait)

    const runEffect = <E>(effect: Effect<void, E, RMsg | RErr>) =>
      new Promise<void>((resolve, reject) =>
        fr(effect)
          .addObserver((exit) => {
            if (Exit.isSuccess(exit)) {
              resolve(exit.value)
            } else {
              // disable @typescript-eslint/prefer-promise-reject-errors
              reject(Cause.pretty(exit.cause, { renderErrorCause: true }))
            }
          })
      )
    yield* Effect.acquireRelease(
      Effect
        .sync(() =>
          r
            .subscribe({
              processError: (err) =>
                runEffect(
                  hndlr
                    .processError(err)
                    .pipe(Effect.catchAllCause((cause) => Effect.logError(`ServiceBus Error ${sessionId}`, cause)))
                ),
              processMessage: (msg) => runEffect(hndlr.processMessage(msg))
              // DO NOT CATCH ERRORS here as they should return to the queue!
            })
        )
        .pipe(withSpanAndLog(`ServiceBus.subscription.create ${sessionId}`)),
      (subscription) =>
        Effect.promise(() => subscription.close()).pipe(withSpanAndLog(`ServiceBus.subscription.close ${sessionId}`))
    )
  })
}

export function subscribeTopic<RMsg, RErr>(
  hndlr: MessageHandlers<RMsg, RErr>,
  subscriptionName: string,
  sessionId?: string
) {
  return Effect.gen(function*() {
    const rf = yield* ServiceBusReceiverFactory
    const fs = yield* FiberSet.make()
    const fr = yield* FiberSet.runtime(fs)<RMsg | RErr>()
    const wait = Effect
      .gen(function*() {
        if ((yield* FiberSet.size(fs)) > 0) {
          yield* InfraLogger.logDebug("Waiting ServiceBusFiberSet to be empty: " + (yield* FiberSet.size(fs)))
        }
        while ((yield* FiberSet.size(fs)) > 0) yield* Effect.sleep("250 millis")
      })
      .pipe(Effect.delay("10 seconds")) // TODO: just for testing
    const r = yield* sessionId
      ? rf.makeTopicSession(
        subscriptionName,
        sessionId,
        wait
      )
      : rf.makeTopic(subscriptionName, wait)

    const runEffect = <E>(effect: Effect<void, E, RMsg | RErr>) =>
      new Promise<void>((resolve, reject) =>
        fr(effect)
          .addObserver((exit) => {
            if (Exit.isSuccess(exit)) {
              resolve(exit.value)
            } else {
              // disable @typescript-eslint/prefer-promise-reject-errors
              reject(Cause.pretty(exit.cause, { renderErrorCause: true }))
            }
          })
      )
    yield* Effect.acquireRelease(
      Effect
        .sync(() =>
          r
            .subscribe({
              processError: (err) =>
                runEffect(
                  hndlr
                    .processError(err)
                    .pipe(Effect.catchAllCause((cause) => Effect.logError(`ServiceBus Error ${sessionId}`, cause)))
                ),
              processMessage: (msg) => runEffect(hndlr.processMessage(msg))
              // DO NOT CATCH ERRORS here as they should return to the queue!
            })
        )
        .pipe(withSpanAndLog(`ServiceBus.subscription.create ${sessionId}`)),
      (subscription) =>
        Effect.promise(() => subscription.close()).pipe(withSpanAndLog(`ServiceBus.subscription.close ${sessionId}`))
    )
  })
}

export interface MessageHandlers<RMsg, RErr> {
  /**
   * Handler that processes messages from service bus.
   *
   * @param message - A message received from Service Bus.
   */
  processMessage(message: ServiceBusReceivedMessage): Effect<void, never, RMsg>
  /**
   * Handler that processes errors that occur during receiving.
   * @param args - The error and additional context to indicate where
   * the error originated.
   */
  processError(args: ProcessErrorArgs): Effect<void, never, RErr>
}

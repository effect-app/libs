/* eslint-disable @typescript-eslint/prefer-promise-reject-errors */
import { type OperationOptionsBase, type ProcessErrorArgs, ServiceBusClient, type ServiceBusMessage, type ServiceBusMessageBatch, type ServiceBusReceivedMessage, type ServiceBusReceiver, type ServiceBusSender } from "@azure/service-bus"
import { Cause, Context, Effect, Exit, FiberSet, Layer, type Scope } from "effect-app"
import { InfraLogger } from "./logger.js"

function makeClient(url: string) {
  return Effect.acquireRelease(
    Effect.sync(() => new ServiceBusClient(url)),
    (client) => Effect.promise(() => client.close())
  )
}

const Client = Context.GenericTag<ServiceBusClient>("@services/Client")
export const LiveServiceBusClient = (url: string) => Layer.scoped(Client)(makeClient(url))

function makeSender(queueName: string) {
  return Effect.gen(function*() {
    const serviceBusClient = yield* Client

    return yield* Effect.acquireRelease(
      Effect.sync(() => serviceBusClient.createSender(queueName)),
      (subscription) => Effect.promise(() => subscription.close())
    )
  })
}
export const Sender = Context.GenericTag<ServiceBusSender>("@services/Sender")

export function LiveSender(queueName: string) {
  return Layer
    .scoped(Sender, makeSender(queueName))
}

function makeReceiver(queueName: string, waitTillEmpty: Effect<void>, sessionId?: string) {
  return Effect.gen(function*() {
    const serviceBusClient = yield* Client

    return yield* Effect.acquireRelease(
      sessionId
        ? Effect.promise(() => serviceBusClient.acceptSession(queueName, sessionId))
        : Effect.sync(() => serviceBusClient.createReceiver(queueName)),
      (r) => waitTillEmpty.pipe(Effect.andThen(Effect.promise(() => r.close())))
    )
  })
}

export class ServiceBusReceiverFactory extends Context.TagId(
  "ServiceBusReceiverFactory"
)<ServiceBusReceiverFactory, {
  make: (waitTillEmpty: Effect<void>) => Effect<ServiceBusReceiver, never, Scope>
  makeSession: (sessionId: string, waitTillEmpty: Effect<void>) => Effect<ServiceBusReceiver, never, Scope>
}>() {
  static readonly Live = (queueName: string) =>
    this.toLayer(Client.pipe(Effect.andThen((cl) => ({
      make: (waitTillEmpty: Effect<void>) =>
        makeReceiver(queueName, waitTillEmpty).pipe(Effect.provideService(Client, cl)),
      makeSession: (sessionId: string, waitTillEmpty: Effect<void>) =>
        makeReceiver(queueName, waitTillEmpty, sessionId).pipe(Effect.provideService(Client, cl))
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
    const wait = Effect.gen(function*() {
      if ((yield* FiberSet.size(fs)) > 0) {
        yield* InfraLogger.logDebug("Waiting ServiceBusFiberSet to be empty: " + (yield* FiberSet.size(fs)))
      }
      while ((yield* FiberSet.size(fs)) > 0) yield* Effect.sleep("250 millis")
    })
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
      Effect.sync(() =>
        r.subscribe({
          processError: (err) =>
            runEffect(
              hndlr
                .processError(err)
                .pipe(Effect.catchAllCause((cause) => Effect.logError("ServiceBus Error", cause)))
            ),
          processMessage: (msg) => runEffect(hndlr.processMessage(msg))
          // DO NOT CATCH ERRORS here as they should return to the queue!
        })
      ),
      (subscription) => Effect.promise(() => subscription.close())
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

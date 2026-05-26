/* eslint-disable @typescript-eslint/prefer-promise-reject-errors */
import { type OperationOptionsBase, type ProcessErrorArgs, ServiceBusClient, type ServiceBusMessage, type ServiceBusMessageBatch, type ServiceBusReceivedMessage, type ServiceBusReceiver } from "@azure/service-bus"
import * as Context from "effect-app/Context"
import * as Effect from "effect-app/Effect"
import * as Layer from "effect-app/Layer"
import * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
import * as FiberSet from "effect/FiberSet"
import type * as Scope from "effect/Scope"
import { InfraLogger } from "./logger.js"

const logged = (name: string) => <A, E, R>(self: Effect.Effect<A, E, R>) =>
  Effect.logInfo(name).pipe(
    Effect.andThen(self),
    Effect.tap(Effect.logInfo(name + " done")),
    Effect.withLogSpan(name)
  )

function makeClient(url: string) {
  return Effect.acquireRelease(
    Effect.sync(() => new ServiceBusClient(url)).pipe(logged("ServiceBus.client.create")),
    (client) => Effect.promise(() => client.close()).pipe(logged("ServiceBus.client.close"))
  )
}

export class ServiceBusClientTag
  extends Context.Opaque<ServiceBusClientTag, ServiceBusClient>()("@services/Client", { make: makeClient })
{
  static readonly layer = (url: string) => this.toLayer(this.make(url))
}

const makeSender_ = Effect.fnUntraced(function*(queueName: string) {
  const serviceBusClient = yield* ServiceBusClientTag

  return yield* Effect.acquireRelease(
    Effect.sync(() => serviceBusClient.createSender(queueName)).pipe(
      logged(`ServiceBus.sender.create ${queueName}`)
    ),
    (sender) => Effect.promise(() => sender.close()).pipe(logged(`ServiceBus.sender.close ${queueName}`))
  )
})

const makeSender = Effect.fnUntraced(function*(name: string) {
  const sender = yield* makeSender_(name)
  const sendMessages = Effect.fnUntraced(function*(
    messages: ServiceBusMessage | ServiceBusMessage[] | ServiceBusMessageBatch,
    options?: Omit<OperationOptionsBase, "abortSignal">
  ) {
    return yield* Effect.promise((abortSignal) => sender.sendMessages(messages, { ...options, abortSignal }))
  })

  return { name, sendMessages }
})

export class Sender extends Context.Opaque<Sender, {
  name: string
  sendMessages: (
    messages: ServiceBusMessage | ServiceBusMessage[] | ServiceBusMessageBatch,
    options?: Omit<OperationOptionsBase, "abortSignal">
  ) => Effect.Effect<void>
}>()("Sender", { make: makeSender }) {
  static readonly layer = (name: string) => this.toLayer(this.make(name))
}

export const SenderTag = <Id>() => <Key extends string>(queueName: Key) => {
  const tag = Context.Service<Id, Sender>(`ServiceBus.Sender.${queueName}`)

  return Object.assign(tag, {
    layer: Layer.effect(
      tag,
      Sender.make(queueName).pipe(Effect.map(Sender.of))
    )
  })
}

const makeReceiver = Effect.fnUntraced(function*(name: string) {
  const serviceBusClient = yield* ServiceBusClientTag

  const makeReceiver = Effect.fnUntraced(
    function*(queueName: string, waitTillEmpty: Effect.Effect<void>, sessionId?: string) {
      const annotate = sessionId !== undefined
        ? Effect.annotateLogs({ "messaging.session.id": sessionId })
        : <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> => self
      return yield* Effect.acquireRelease(
        (sessionId
          ? Effect.promise(() => serviceBusClient.acceptSession(queueName, sessionId))
          : Effect.sync(() => serviceBusClient.createReceiver(queueName)))
          .pipe(logged(`ServiceBus.receiver.create ${queueName}`), annotate),
        (r) =>
          waitTillEmpty.pipe(
            logged(`ServiceBus.receiver.waitTillEmpty ${queueName}`),
            Effect.andThen(
              Effect.promise(() => r.close()).pipe(
                logged(`ServiceBus.receiver.close ${queueName}`)
              )
            ),
            logged(`ServiceBus.receiver.release ${queueName}`),
            annotate
          )
      )
    }
  )

  const make = (waitTillEmpty: Effect.Effect<void>) => makeReceiver(name, waitTillEmpty)

  const makeSession = (sessionId: string, waitTillEmpty: Effect.Effect<void>) =>
    makeReceiver(name, waitTillEmpty, sessionId)

  return {
    name,
    make,
    makeSession,
    subscribe: Effect.fnUntraced(function*<RMsg, RErr>(hndlr: MessageHandlers<RMsg, RErr>, sessionId?: string) {
      const fs = yield* FiberSet.make()
      const fr = yield* FiberSet.runtime(fs)<RMsg | RErr>()
      const wait = Effect
        .gen(function*() {
          if ((yield* FiberSet.size(fs)) > 0) {
            yield* InfraLogger.logDebug("Waiting ServiceBusFiberSet to be empty: " + (yield* FiberSet.size(fs)))
          }
          while ((yield* FiberSet.size(fs)) > 0) yield* Effect.sleep("250 millis")
        })
      const r = yield* sessionId
        ? makeSession(
          sessionId,
          wait
        )
        : make(wait)

      const runEffect = <E>(effect: Effect.Effect<void, E, RMsg | RErr>) =>
        new Promise<void>((resolve, reject) =>
          fr(effect)
            .addObserver((exit) => {
              if (Exit.isSuccess(exit)) {
                resolve(exit.value)
              } else {
                // disable @typescript-eslint/prefer-promise-reject-errors
                reject(Cause.pretty(exit.cause))
              }
            })
        )

      const annotate = sessionId !== undefined
        ? Effect.annotateLogs({ "messaging.session.id": sessionId })
        : <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> => self
      yield* Effect.acquireRelease(
        Effect
          .sync(() => {
            const s = r
              .subscribe({
                processError: (err) =>
                  runEffect(
                    hndlr
                      .processError(err)
                      .pipe(
                        Effect.catchCause((cause) => Effect.logError("ServiceBus Error", cause)),
                        annotate
                      )
                  ),
                processMessage: (msg) => runEffect(hndlr.processMessage(msg).pipe(annotate))
                // DO NOT CATCH ERRORS here as they should return to the queue!
              })
            return { close: Effect.promise(() => s.close()) }
          })
          .pipe(logged("ServiceBus.subscription.create"), annotate),
        (subscription) =>
          subscription.close.pipe(
            logged("ServiceBus.subscription.close"),
            annotate
          )
      ) as Effect.Effect<void, never, Scope.Scope> // wth is going on here
    })
  }
})

export class Receiver extends Context.Opaque<Receiver, {
  name: string
  make: (waitTillEmpty: Effect.Effect<void>) => Effect.Effect<ServiceBusReceiver, never, Scope.Scope>
  makeSession: (
    sessionId: string,
    waitTillEmpty: Effect.Effect<void>
  ) => Effect.Effect<ServiceBusReceiver, never, Scope.Scope>
  subscribe<RMsg, RErr>(
    hndlr: MessageHandlers<RMsg, RErr>,
    sessionId?: string
  ): Effect.Effect<void, never, Scope.Scope | RMsg | RErr>
}>()("Receiver") {
  static readonly make = makeReceiver
  static readonly layer = (name: string) => this.toLayer(makeReceiver(name))
}

export const ReceiverTag = <Id>() => <Key extends string>(queueName: Key) => {
  const tag = Context.Service<Id, Receiver>(`ServiceBus.Receiver.${queueName}`)

  return Object.assign(tag, {
    layer: Layer.effect(
      tag,
      makeReceiver(queueName).pipe(Effect.map(Receiver.of))
    )
  })
}

export const SenderReceiver = (queue: string, queueDrain?: string) =>
  Layer.mergeAll(Sender.layer(queue), Receiver.layer(queueDrain ?? queue))

export interface MessageHandlers<RMsg, RErr> {
  /**
   * Handler that processes messages from service bus.
   *
   * @param message - A message received from Service Bus.
   */
  processMessage(message: ServiceBusReceivedMessage): Effect.Effect<void, never, RMsg>
  /**
   * Handler that processes errors that occur during receiving.
   * @param args - The error and additional context to indicate where
   * the error originated.
   */
  processError(args: ProcessErrorArgs): Effect.Effect<void, never, RErr>
}

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

export class ServiceBusClientTag extends Context.Tag("@services/Client")<ServiceBusClientTag, ServiceBusClient>() {
  static readonly layer = (url: string) => Layer.scoped(this, makeClient(url))
}

function makeSender(queueName: string) {
  return Effect.gen(function*() {
    const serviceBusClient = yield* ServiceBusClientTag

    return yield* Effect.acquireRelease(
      Effect.sync(() => serviceBusClient.createSender(queueName)).pipe(
        withSpanAndLog(`ServiceBus.sender.create ${queueName}`)
      ),
      (sender) => Effect.promise(() => sender.close()).pipe(withSpanAndLog(`ServiceBus.sender.close ${queueName}`))
    )
  })
}
export const Sender = Context.GenericTag<ServiceBusSender>("@services/Sender")

export interface Sender {
  sendMessages: (
    messages: ServiceBusMessage | ServiceBusMessage[] | ServiceBusMessageBatch,
    options?: Omit<OperationOptionsBase, "abortSignal"> | undefined
  ) => Effect.Effect<void, never, never>
}

export const makeSenderTag = <Id, Key extends string>(queueName: Key) => {
  const tag = Context.Tag(`ServiceBus.Sender.${queueName}`)<
    Id,
    Sender
  >()

  return Object.assign(tag, {
    layer: Layer.scoped(
      tag,
      Effect.gen(function*() {
        const sender = yield* makeSender(queueName)
        const sendMessages = Effect.fnUntraced(function*(
          messages: ServiceBusMessage | ServiceBusMessage[] | ServiceBusMessageBatch,
          options?: Omit<OperationOptionsBase, "abortSignal">
        ) {
          return yield* Effect.promise((abortSignal) => sender.sendMessages(messages, { ...options, abortSignal }))
        })

        return { sendMessages }
      })
    )
  })
}

const senderMap = new Map<string, any>()

export const SenderTag = <Id>() => <Key extends string>(queueName: Key): ReturnType<typeof makeSenderTag<Id, Key>> => {
  if (senderMap.has(queueName)) {
    return senderMap.get(queueName)
  }

  const tag = makeSenderTag<Id, Key>(queueName)
  senderMap.set(queueName, tag)
  return tag
}

export interface Receiver {
  make: (waitTillEmpty: Effect<void>) => Effect<ServiceBusReceiver, never, Scope>
  makeSession: (sessionId: string, waitTillEmpty: Effect<void>) => Effect<ServiceBusReceiver, never, Scope>
  subscribe<RMsg, RErr>(
    hndlr: MessageHandlers<RMsg, RErr>,
    sessionId?: string
  ): Effect.Effect<void, never, Scope.Scope | RMsg | RErr>
}

const receiverMap = new Map<string, any>()
const makeReceiverTag = <Id, Key extends string>(queueName: Key) => {
  const tag = Context.Tag(`ServiceBus.Receiver.${queueName}`)<Id, Receiver>()

  return Object.assign(tag, {
    layer: Layer.effect(
      tag,
      Effect.gen(function*() {
        const serviceBusClient = yield* ServiceBusClientTag

        const makeReceiver = Effect.fnUntraced(
          function*(queueName: string, waitTillEmpty: Effect<void>, sessionId?: string) {
            return yield* Effect.acquireRelease(
              (sessionId
                ? Effect.promise(() => serviceBusClient.acceptSession(queueName, sessionId))
                : Effect.sync(() => serviceBusClient.createReceiver(queueName)))
                .pipe(withSpanAndLog(`ServiceBus.receiver.create ${queueName}.${sessionId}`)),
              (r) =>
                waitTillEmpty.pipe(
                  withSpanAndLog(`ServiceBus.receiver.waitTillEmpty ${queueName}.${sessionId}`),
                  Effect.andThen(
                    Effect.promise(() => r.close()).pipe(
                      withSpanAndLog(`ServiceBus.receiver.close ${queueName}.${sessionId}`)
                    )
                  ),
                  withSpanAndLog(`ServiceBus.receiver.release ${queueName}.${sessionId}`)
                )
            )
          }
        )

        const make = (waitTillEmpty: Effect<void>) => makeReceiver(queueName, waitTillEmpty)

        const makeSession = (sessionId: string, waitTillEmpty: Effect<void>) =>
          makeReceiver(queueName, waitTillEmpty, sessionId)

        return {
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
                            .pipe(
                              Effect.catchAllCause((cause) => Effect.logError(`ServiceBus Error ${sessionId}`, cause))
                            )
                        ),
                      processMessage: (msg) => runEffect(hndlr.processMessage(msg))
                      // DO NOT CATCH ERRORS here as they should return to the queue!
                    })
                )
                .pipe(withSpanAndLog(`ServiceBus.subscription.create ${sessionId}`)),
              (subscription) =>
                Effect.promise(() => subscription.close()).pipe(
                  withSpanAndLog(`ServiceBus.subscription.close ${sessionId}`)
                )
            )
          })
        }
      })
    )
  })
}
export const ReceiverTag =
  <Id>() => <Key extends string>(queueName: Key): ReturnType<typeof makeReceiverTag<Id, Key>> => {
    if (receiverMap.has(queueName)) {
      return receiverMap.get(queueName)
    }

    const tag = makeReceiverTag<Id, Key>(queueName)
    receiverMap.set(queueName, tag)
    return tag
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

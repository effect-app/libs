import type express from "express"
import type {
  InvalidStateError,
  NotFoundError,
  NotLoggedInError,
  OptimisticConcurrencyException,
  UnauthorizedError,
  ValidationError
} from "../errors.js"
import { logRequestError } from "./reportError.js"

export function defaultBasicErrorHandler<R>(
  _req: express.Request,
  res: express.Response,
  r2: Effect<R, ValidationError, void>
) {
  const sendError = (code: number) => (body: unknown) => Effect(res.status(code).send(body))
  return r2
    .tapErrorCause((cause) => cause.isFailure() ? logRequestError(cause) : Effect.unit)
    .catchTag("ValidationError", (err) => sendError(400)(err.errors))
    // final catch all; expecting never so that unhandled known errors will show up
    .catchAll((err: never) =>
      Effect
        .logError(
          "Program error, compiler probably silenced, got an unsupported Error in Error Channel of Effect" + err
        )
        .map(() => err as unknown)
        .flatMap(Effect.die)
    )
}

const optimisticConcurrencySchedule = Schedule.once
  && Schedule.recurWhile<SupportedErrors>((a) => a._tag === "OptimisticConcurrencyException")

export function defaultErrorHandler<R>(
  req: express.Request,
  res: express.Response,
  r2: Effect<R, SupportedErrors, void>
) {
  const r3 = req.method === "PATCH"
    ? r2.retry(optimisticConcurrencySchedule)
    : r2
  const sendError = (code: number) => (body: unknown) => Effect(res.status(code).send(body))
  return r3
    .tapErrorCause((cause) => cause.isFailure() ? logRequestError(cause) : Effect.unit)
    .catchTags({
      "ValidationError": (err) => sendError(400)(err.errors),
      "NotFoundError": sendError(404),
      "NotLoggedInError": sendError(401),
      "UnauthorizedError": sendError(403),
      "InvalidStateError": sendError(422),
      // 412 or 409.. https://stackoverflow.com/questions/19122088/which-http-status-code-to-use-to-reject-a-put-due-to-optimistic-locking-failure
      "OptimisticConcurrencyException": sendError(412)
    })
    // final catch all; expecting never so that unhandled known errors will show up
    .catchAll((err: never) =>
      Effect
        .logError(
          "Program error, compiler probably silenced, got an unsupported Error in Error Channel of Effect" + err
        )
        .map(() => err as unknown)
        .flatMap(Effect.die)
    )
}

export type SupportedErrors =
  | ValidationError
  | NotFoundError
  | NotLoggedInError
  | UnauthorizedError
  | InvalidStateError
  | OptimisticConcurrencyException

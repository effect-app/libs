/* eslint-disable @typescript-eslint/no-explicit-any */

import * as api from "@opentelemetry/api"
import type { DeepKeys, StandardSchemaV1Issue, ValidationError, ValidationErrorMap } from "@tanstack/vue-form"
import { Data, Effect, Fiber, Option } from "effect-app"
import { runtimeFiberAsPromise } from "effect-app/utils"
import type { Fiber as EffectFiber } from "effect/Fiber"
import type { OmegaFormApi, OmegaFormParams } from "./types"

export class FormErrors<From> extends Data.TaggedError("FormErrors")<{
  form: {
    // TODO: error shapes seem off, with `undefined` etc..
    errors: (Record<string, StandardSchemaV1Issue[]> | undefined)[]
    errorMap: ValidationErrorMap<
      undefined,
      undefined,
      Record<string, StandardSchemaV1Issue[]>,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined
    >
  }
  fields: Record<DeepKeys<From>, {
    errors: ValidationError[]
    errorMap: ValidationErrorMap
  }>
}> {}

export const wrapWithSpan = (span: api.Span | undefined, toWrap: () => any) => {
  return span ? api.context.with(api.trace.setSpan(api.context.active(), span), toWrap) : toWrap()
}

export type UserOnSubmit<From, To> = (props: {
  formApi: OmegaFormParams<From, To>
  meta: any
  value: To
}) => Promise<any> | EffectFiber<any, any> | Effect.Effect<unknown, any, never>

export type RunPromise = <A, E>(eff: Effect.Effect<A, E, never>) => Promise<A>

/**
 * Wraps the user's `onSubmit` to:
 * - run inside the OpenTelemetry span passed via `meta.currentSpan`
 * - decode the raw form `value` (validators only validate, they don't transform)
 * - normalize Promise / Effect / Fiber return values to a Promise
 *
 * Returns `undefined` when `userOnSubmit` is `undefined` (so callers can pass it
 * directly to `useForm({ onSubmit })` without changing semantics).
 */
export const wrapOnSubmit = <From, To>(
  userOnSubmit: UserOnSubmit<From, To> | undefined,
  decode: (value: From) => Effect.Effect<To, any, never>,
  runPromise: RunPromise
) => {
  if (!userOnSubmit) return undefined
  return ({ formApi, meta, value }: { formApi: OmegaFormParams<From, To>; meta: any; value: From }) =>
    wrapWithSpan(meta?.currentSpan, async () => {
      // validators only validate, they don't actually transform, so we have to do that manually here.
      const parsedValue = await runPromise(decode(value))
      const r = userOnSubmit({
        formApi: formApi as OmegaFormApi<From, To>,
        meta,
        value: parsedValue
      })
      if (Fiber.isFiber(r)) {
        return await runtimeFiberAsPromise(r)
      }
      if (Effect.isEffect(r)) {
        const effectResult = await runPromise(r)
        return Fiber.isFiber(effectResult)
          ? await runtimeFiberAsPromise(effectResult)
          : effectResult
      }
      return r
    })
}

/**
 * Builds the public submit handlers from a `useForm`-returned `form`:
 * - `handleSubmit` injects the current OpenTelemetry span as `meta.currentSpan`.
 * - `handleSubmitEffect` runs `handleSubmit` inside an Effect that picks up the
 *   ambient `Effect.currentSpan`. With `checkErrors: true`, it fails with
 *   `FormErrors<From>` when validation produced errors.
 */
export const makeSubmitHandlers = <From, To>(
  form: OmegaFormApi<From, To>
) => {
  const hs = form.handleSubmit

  const handleSubmitInner: typeof form.handleSubmit = async (meta?: Record<string, any>) => {
    return await hs(meta)
  }

  const handleSubmit = (meta?: Record<string, any>) => {
    const span = api.trace.getSpan(api.context.active())
    return handleSubmitInner({ currentSpan: span, ...meta })
  }

  const handleSubmitEffect_ = (meta?: Record<string, any>) =>
    Effect.currentSpan.pipe(
      Effect.option,
      Effect
        .flatMap((span) =>
          Effect.promise(() => handleSubmitInner(Option.isSome(span) ? { currentSpan: span.value, ...meta } : meta))
        )
    )

  const handleSubmitEffect: {
    (options: { checkErrors: true; meta?: Record<string, any> }): Effect.Effect<void, FormErrors<From>>
    (options?: { meta?: Record<string, any> }): Effect.Effect<void>
  } = (
    options?: { meta?: Record<string, any>; checkErrors?: true }
  ): any =>
    options?.checkErrors
      ? handleSubmitEffect_(options?.meta).pipe(Effect.flatMap(Effect.fnUntraced(function*() {
        const errors = form.getAllErrors()
        if (Object.keys(errors.fields).length || errors.form.errors.length) {
          return yield* Effect.fail(new FormErrors({ form: errors.form, fields: errors.fields }))
        }
      })))
      : handleSubmitEffect_(options?.meta)

  return { handleSubmit, handleSubmitEffect }
}

import * as Option from "effect-app/Option"
import { LocaleRef, RequestContext } from "effect-app/RequestContext"
import { NonEmptyString255 } from "effect-app/Schema"
import type * as Fiber from "effect/Fiber"
import { storeId } from "../Store/Memory.js"

export function getRequestContextFromFiber(fiber: Fiber.Fiber<unknown, unknown>) {
  const span = Option.fromNullishOr(fiber.currentSpan)
  const locale = fiber.getRef(LocaleRef)
  const namespace = fiber.getRef(storeId)
  return RequestContext.make({
    span: Option.map(span, (s) => ({ spanId: s.spanId, traceId: s.traceId, sampled: s.sampled })).pipe(
      Option.getOrElse(() => ({ spanId: "bogus", sampled: true, traceId: "bogus" }))
    ),
    name: NonEmptyString255("_"),
    locale,
    namespace
  })
}

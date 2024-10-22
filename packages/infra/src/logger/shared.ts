import { NonEmptyString255 } from "effect-app/Schema"
import { Context, FiberRef, Option, Tracer } from "effect-app"
import * as FiberRefs from "effect/FiberRefs"
import { LocaleRef, RequestContext } from "../RequestContext.js"
import { storeId } from "../services/Store/Memory.js"

export function getRequestContextFromFiberRefs(fiberRefs: FiberRefs.FiberRefs) {
  const context = FiberRefs.getOrDefault(fiberRefs, FiberRef.currentContext)
  const span = Context.getOption(context, Tracer.ParentSpan)
  const locale = FiberRefs.getOrDefault(fiberRefs, LocaleRef)
  const namespace = FiberRefs.getOrDefault(fiberRefs, storeId)
  return new RequestContext({
    span: Option.getOrElse(
      span,
      () => ({ spanId: "bogus", sampled: true, traceId: "bogus" })
    ),
    name: NonEmptyString255("_"),
    locale,
    namespace
  })
}

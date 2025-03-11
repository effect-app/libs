import { Context, FiberRef, Option, Tracer } from "effect-app"
import { NonEmptyString255 } from "effect-app/Schema"
import * as FiberRefs from "effect/FiberRefs"
import { LocaleRef, RequestContext } from "../RequestContext.js"
import { storeId } from "../Store/Memory.js"

export function getRequestContextFromCurrentContext(fiberRefs: FiberRefs.FiberRefs) {
  const context = FiberRefs.getOrDefault(fiberRefs, FiberRef.currentContext)
  const span = Context.getOption(context, Tracer.ParentSpan)
  const locale = Context.get(context, LocaleRef)
  const namespace = Context.get(context, storeId)
  return new RequestContext({
    span: Option.map(span, Tracer.externalSpan).pipe(
      Option.getOrElse(() => ({ spanId: "bogus", sampled: true, traceId: "bogus" }))
    ),
    name: NonEmptyString255("_"),
    locale,
    namespace
  })
}

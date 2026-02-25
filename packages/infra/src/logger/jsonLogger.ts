import { Array, Cause, Logger } from "effect-app"
import { CurrentLogAnnotations, CurrentLogSpans } from "effect/References"
import { spanAttributes } from "../RequestContext.js"
import { getRequestContextFromFiber } from "./shared.js"

export const jsonLogger = Logger.make<unknown, void>(
  ({ cause, date, fiber, logLevel, message }) => {
    const nowMillis = date.getTime()

    const request = getRequestContextFromFiber(fiber)
    const spans = fiber.getRef(CurrentLogSpans)
    const annotations = fiber.getRef(CurrentLogAnnotations)

    const data = {
      timestamp: date,
      level: logLevel,
      fiber: "#" + fiber.id,
      message,
      request: spanAttributes(request),
      cause: cause !== Cause.empty ? Cause.pretty(cause) : undefined,
      spans: Array.isReadonlyArrayNonEmpty(spans)
        ? spans.map(([label, startTime]) => ({ label, timing: nowMillis - startTime }))
        : undefined,
      annotations: Object.keys(annotations).length > 0
        ? annotations
        : undefined
    }

    globalThis.console.log(JSON.stringify(data))
  }
)

export const logJson = Logger.layer([jsonLogger])

import { Logger } from "effect-app"
import { spanAttributes } from "../RequestContext.js"
import { getRequestContextFromFiber } from "./shared.js"

export const logfmtLogger = Logger.make<unknown, void>(
  (options) => {
    const requestContext = getRequestContextFromFiber(options.fiber)
    let formatted = Logger.formatLogFmt.log(options)
    if (requestContext.name !== "_root_") {
      for (const [key, value] of Object.entries(spanAttributes(requestContext))) {
        formatted += ` ${key}=${JSON.stringify(String(value))}`
      }
    }
    globalThis.console.log(formatted)
  }
)

export const logFmt = Logger.layer([logfmtLogger])

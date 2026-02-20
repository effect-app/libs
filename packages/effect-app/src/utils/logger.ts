/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { Effect, type LogLevel, ServiceMap } from "effect"

type Levels = "info" | "debug" | "warn" | "error"

export const LogLevels = ServiceMap.Reference<ReadonlyMap<string, Levels>>("LogLevels", {
  defaultValue: (): ReadonlyMap<string, Levels> => new Map<string, Levels>()
})

export const makeLog = (namespace: string, defaultLevel: Levels = "warn") => {
  const level = Effect.gen(function*() {
    const levels = yield* LogLevels
    return levels.get(namespace) ?? defaultLevel
  })
  const withLogNamespace = Effect.annotateLogs({ logNamespace: namespace })
  return {
    logWarning: (...message: ReadonlyArray<any>) =>
      level.pipe(
        Effect.andThen((l) =>
          l === "info" || l === "debug" || l === "warn"
            ? Effect.logWarning(...message).pipe(withLogNamespace)
            : Effect.void
        )
      ),
    logError: (...message: ReadonlyArray<any>) => Effect.logError(...message).pipe(withLogNamespace),
    logFatal: (...message: ReadonlyArray<any>) => Effect.logFatal(...message).pipe(withLogNamespace),
    logInfo: (...message: ReadonlyArray<any>) =>
      level.pipe(
        Effect.andThen((l) =>
          l === "info" || l === "debug" ? Effect.logInfo(...message).pipe(withLogNamespace) : Effect.void
        )
      ),
    logDebug: (...message: ReadonlyArray<any>) =>
      level.pipe(
        Effect.andThen((l) => l === "debug" ? Effect.logDebug(...message).pipe(withLogNamespace) : Effect.void)
      ),
    // for now always log
    logWithLevel: (level: LogLevel.LogLevel, ...message: ReadonlyArray<any>) =>
      Effect.logWithLevel(level)(...message).pipe(withLogNamespace)
  }
}

/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { Effect, type LogLevel } from "effect"
import * as ServiceMap from "../ServiceMap.js"

type Levels = "info" | "debug" | "warn" | "error"

export class LogLevels extends ServiceMap.Reference<LogLevels>()("LogLevels", {
  defaultValue: () => new Map<string, Levels>()
}) {}

export const makeLog = (namespace: string, defaultLevel: Levels = "warn") => {
  const level = LogLevels.use((levels) => Effect.succeed(levels.get(namespace) ?? defaultLevel))
  const withLogNamespace = Effect.annotateLogs({ logNamespace: namespace })
  return {
    logWarning: (...message: ReadonlyArray<any>) =>
      Effect.flatMap(level, (l) =>
        l === "info" || l === "debug" || l === "warn"
          ? Effect.logWarning(...message).pipe(withLogNamespace)
          : Effect.void),
    logError: (...message: ReadonlyArray<any>) => Effect.logError(...message).pipe(withLogNamespace),
    logFatal: (...message: ReadonlyArray<any>) => Effect.logFatal(...message).pipe(withLogNamespace),
    logInfo: (...message: ReadonlyArray<any>) =>
      Effect.flatMap(
        level,
        (l) => l === "info" || l === "debug" ? Effect.logInfo(...message).pipe(withLogNamespace) : Effect.void
      ),
    logDebug: (...message: ReadonlyArray<any>) =>
      Effect.flatMap(level, (l) => l === "debug" ? Effect.logDebug(...message).pipe(withLogNamespace) : Effect.void),
    // for now always log
    logWithLevel: (level: LogLevel.Severity, ...message: ReadonlyArray<any>) =>
      Effect.logWithLevel(level)(...message).pipe(withLogNamespace)
  }
}

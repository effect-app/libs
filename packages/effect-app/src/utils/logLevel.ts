import { LogLevel } from "effect"

export const LogLevelToSentry = (level: LogLevel.LogLevel) => {
  switch (level) {
    case LogLevel.Debug:
      return "debug" as const
    case LogLevel.Info:
      return "info" as const
    case LogLevel.Warning:
      return "warning" as const
    case LogLevel.Error:
      return "error" as const
    case LogLevel.Fatal:
      return "fatal" as const
  }
  return "log" as const
}

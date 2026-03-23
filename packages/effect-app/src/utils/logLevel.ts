import { type LogLevel } from "effect"

export const LogLevelToSentry = (level: LogLevel.LogLevel) => {
  switch (level) {
    case "Debug":
      return "debug" as const
    case "Info":
      return "info" as const
    case "Warn":
      return "warning" as const
    case "Error":
      return "error" as const
    case "Fatal":
      return "fatal" as const
  }
  return "log" as const
}

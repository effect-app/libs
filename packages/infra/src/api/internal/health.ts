import { HttpMiddleware, HttpServerResponse } from "effect-app/http"

export function serverHealth(version: string) {
  return HttpServerResponse.json({ version }).pipe(HttpMiddleware.withLoggerDisabled)
}

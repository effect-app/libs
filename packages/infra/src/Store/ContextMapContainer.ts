import { Context, Data, Effect, Layer } from "effect-app"
import { ContextMap } from "./service.js"

// TODO: we have to create a new contextmap on every request.
// we want to share one map during startup
// but we want to make sure we don't re-use the startup map after startup
// we can call another start after startup. but it would be even better if we could Die on accessing rootmap
// we could also make the ContextMap optional, and when missing, issue a warning instead?

export class ContextMapContainer extends Context.Reference<ContextMapContainer>()("ContextMapContainer", {
  defaultValue: (): ContextMap | "root" => "root"
}) {
  static readonly layer = Layer.effect(this, ContextMap.make)
}

export class ContextMapNotStartedError extends Data.TaggedError("ContextMapNotStartedError") {}

export const getContextMap = ContextMapContainer.pipe(
  Effect.filterOrFail((_) => _ !== "root", () => new ContextMapNotStartedError())
)

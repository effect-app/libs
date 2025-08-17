import { Effect } from "effect-app"
import { Operation } from "effect-app/Operations"
import { makeRepo } from "./Model.js"

// @effect-diagnostics-next-line missingEffectServiceDependency:off
export class OperationsRepo extends Effect.Service<OperationsRepo>()(
  "OperationRepo",
  {
    effect: Effect.gen(function*() {
      return yield* makeRepo("Operation", Operation, {
        config: {
          allowNamespace: () => true
        }
      })
    })
  }
) {}

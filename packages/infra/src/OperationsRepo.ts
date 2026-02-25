import { Effect, ServiceMap } from "effect-app"
import { Operation } from "effect-app/Operations"
import { makeRepo } from "./Model.js"

export class OperationsRepo extends ServiceMap.Service<OperationsRepo>()(
  "OperationRepo",
  {
    make: Effect.gen(function*() {
      return yield* makeRepo("Operation", Operation, {
        config: {
          allowNamespace: () => true
        }
      })
    })
  }
) {}

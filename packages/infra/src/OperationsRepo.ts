import { Context, Effect } from "effect-app"
import { Operation } from "effect-app/Operations"
import { makeRepo } from "./Model.js"

export class OperationsRepo extends Context.Service<OperationsRepo>()(
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

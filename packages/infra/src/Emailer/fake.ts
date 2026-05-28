import * as Effect from "effect-app/Effect"
import { Emailer } from "effect-app/Emailer"
import { pretty } from "effect-app/utils"
import { InfraLogger } from "../logger.js"

const makeFake = InfraLogger
  .logInfo("FAKE Emailer Service enabled")
  .pipe(Effect.map(() =>
    Emailer.of({
      sendMail: Effect.fn("Emailer.sendMail", { attributes: { "messaging.system": "fake" } })((msg) =>
        InfraLogger
          .logDebug(`Fake send mail`)
          .pipe(Effect.annotateLogs("msg", pretty(msg)))
      )
    })
  ))

export const FakeSendgrid = Emailer.toLayer(makeFake)

import type { EmailData } from "@sendgrid/helpers/classes/email-address.js"
import type { MailContent } from "@sendgrid/helpers/classes/mail.js"
import sgMail from "@sendgrid/mail"
import { Array, Effect, Equivalence, Redacted } from "effect-app"
import { dropUndefinedT } from "effect-app/utils"
import { inspect } from "util"
import { InfraLogger } from "../logger.js"
import { Emailer, type EmailMsg, type EmailMsgOptionalFrom, type SendgridConfig, SendMailError } from "./service.js"

const makeSendgrid = (
  { apiKey, defaultFrom, defaultReplyTo, fakeMailAddress, realMail, subjectPrefix }: SendgridConfig
) =>
  Effect.sync(() => {
    sgMail.setApiKey(Redacted.value(apiKey))

    return Emailer.of({
      sendMail: Effect.fn("Sendgrid.sendMail")(function*(msg_: EmailMsgOptionalFrom) {
        const msg: EmailMsg = dropUndefinedT({
          ...msg_,
          from: msg_.from ?? defaultFrom,
          replyTo: msg_.replyTo ?? (msg_.from ? undefined : defaultReplyTo)
        })
        const render = renderMessage(!realMail, fakeMailAddress)

        const renderedMsg_ = render(msg)
        const renderedMsg = {
          ...renderedMsg_ as Omit<typeof renderedMsg_, "content">,
          subject: `${subjectPrefix}${renderedMsg_.subject}`,
          ..."content" in renderedMsg_
            ? { content: [...renderedMsg_.content] as [MailContent, ...MailContent[]] }
            : {}
        }
        yield* InfraLogger.logDebug("Sending email").pipe(Effect.annotateLogs("msg", inspect(renderedMsg, false, 5)))

        const ret = yield* Effect
          .callback<
            [sgMail.ClientResponse, Record<string, unknown>],
            Error | sgMail.ResponseError
          >(
            (resume) =>
              void sgMail.send(
                renderedMsg as any, // sue me
                msg.isMultiple ?? true,
                (err, result) =>
                  err
                    ? resume(Effect.fail(err))
                    : resume(Effect.sync(() => result))
              )
          )
          .pipe(Effect.mapError((raw) => new SendMailError({ raw })))

        // const event = {
        //   name: "EmailSent",
        //   properties: {
        //     templateId: msg.templateId
        //   }
        // }
        // yield* InfraLogger.logDebug("Tracking email event").annotateLogs("event", event.$$.pretty)
        // const { trackEvent } = yield* AiContextService
        // trackEvent(event)
        return ret
      })
    })
  })

export function Sendgrid(config: SendgridConfig) {
  return Emailer.toLayer(makeSendgrid(config))
}

/**
 * @hidden
 */
export function renderMessage(forceFake: boolean, fakeMailAddress: string) {
  let i = 0
  const makeId = () => i++
  const makeFakeEmail = () => fakeMailAddress.replace("{i}", String(makeId()))
  return forceFake
    ? (msg: EmailMsg) =>
      dropUndefinedT({
        ...msg,
        to: msg.to && renderFake(msg.to, makeFakeEmail),
        cc: msg.cc && renderFake(msg.cc, makeFakeEmail),
        bcc: msg.bcc && renderFake(msg.bcc, makeFakeEmail)
      })
    : (msg: EmailMsg) =>
      dropUndefinedT({
        ...msg,
        to: msg.to && renderFakeIfTest(msg.to, makeFakeEmail),
        cc: msg.cc && renderFakeIfTest(msg.cc, makeFakeEmail),
        bcc: msg.bcc && renderFakeIfTest(msg.bcc, makeFakeEmail)
      })
}

/**
 * @hidden
 */
export function isTestAddress(to: EmailData) {
  return (
    (typeof to === "string" && to.toLowerCase().endsWith(".test"))
    || (typeof to === "object"
      && "email" in to
      && to.email.toLowerCase().endsWith(".test"))
  )
}

function renderFake(addr: EmailData | readonly EmailData[], makeEmail: () => string) {
  return {
    name: renderMailData(addr),
    email: makeEmail()
  }
}
const eq = Equivalence.mapInput(
  Equivalence.String,
  (to: { name?: string; email: string } | string) => typeof to === "string" ? to.toLowerCase() : to.email.toLowerCase()
)

function isEmailDataArray(md: EmailData | readonly EmailData[]): md is readonly EmailData[] {
  return globalThis.Array.isArray(md)
}

// TODO: should just not add any already added email address
// https://stackoverflow.com/a/53603076/11595834
function renderFakeIfTest(addr: EmailData | readonly EmailData[], makeEmail: () => string) {
  if (isEmailDataArray(addr)) {
    return Array.dedupeWith(
      addr.map((x) => (isTestAddress(x) ? renderFake(x, makeEmail) : x)),
      eq
    )
  }
  return isTestAddress(addr) ? renderFake(addr, makeEmail) : addr
}

function renderMailData(md: EmailData | readonly EmailData[]): string {
  if (isEmailDataArray(md)) {
    return md.map(renderMailData).join(", ")
  }
  if (typeof md === "string") {
    return md
  }
  return md.email
}

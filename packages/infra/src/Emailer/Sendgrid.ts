import type { EmailData } from "@sendgrid/helpers/classes/email-address.js"
import type { MailContent } from "@sendgrid/helpers/classes/mail.js"
import sgMail from "@sendgrid/mail"
import { Array, Effect, Equivalence, Redacted } from "effect-app"
import { dropUndefinedT } from "effect-app/utils"
import { inspect } from "util"
import { InfraLogger } from "../logger.js"
import { Emailer, type EmailMsg, type EmailMsgOptionalFrom, type SendgridConfig, SendMailError } from "./service.js"

const makeSendgrid = ({ apiKey, defaultFrom, defaultReplyTo, realMail, subjectPrefix }: SendgridConfig) =>
  Effect.sync(() => {
    sgMail.setApiKey(Redacted.value(apiKey))

    return Emailer.of({
      sendMail(msg_: EmailMsgOptionalFrom) {
        return Effect.gen(function*() {
          const msg: EmailMsg = dropUndefinedT({
            ...msg_,
            from: msg_.from ?? defaultFrom,
            replyTo: msg_.replyTo ?? (msg_.from ? undefined : defaultReplyTo)
          })
          const render = renderMessage(!realMail)

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
            .async<
              [sgMail.ClientResponse, Record<string, unknown>],
              Error | sgMail.ResponseError
            >(
              (cb) =>
                void sgMail.send(
                  renderedMsg as any, // sue me
                  msg.isMultiple ?? true,
                  (err, result) =>
                    err
                      ? cb(Effect.fail(err))
                      : cb(Effect.sync(() => result))
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
      }
    })
  })

export function Sendgrid(config: SendgridConfig) {
  return Emailer.toLayer(makeSendgrid(config))
}

/**
 * @hidden
 */
export function renderMessage(forceFake: boolean) {
  let i = 0
  const makeId = () => i++
  return forceFake
    ? (msg: EmailMsg) =>
      dropUndefinedT({
        ...msg,
        to: msg.to && renderFake(msg.to, makeId),
        cc: msg.cc && renderFake(msg.cc, makeId),
        bcc: msg.bcc && renderFake(msg.bcc, makeId)
      })
    : (msg: EmailMsg) =>
      dropUndefinedT({
        ...msg,
        to: msg.to && renderFakeIfTest(msg.to, makeId),
        cc: msg.cc && renderFakeIfTest(msg.cc, makeId),
        bcc: msg.bcc && renderFakeIfTest(msg.bcc, makeId)
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

function renderFake(addr: EmailData | readonly EmailData[], makeId: () => number) {
  return {
    name: renderMailData(addr),
    email: `test+${makeId()}@nomizz.com`
  }
}
const eq = Equivalence.mapInput(
  Equivalence.string,
  (to: { name?: string; email: string } | string) => typeof to === "string" ? to.toLowerCase() : to.email.toLowerCase()
)

// TODO: should just not add any already added email address
// https://stackoverflow.com/a/53603076/11595834
function renderFakeIfTest(addr: EmailData | readonly EmailData[], makeId: () => number) {
  return Array.isArray(addr)
    ? Array.dedupeWith(
      addr
        .map((x) => (isTestAddress(x) ? renderFake(x, makeId) : x)),
      eq
    )
    : isTestAddress(addr)
    ? renderFake(addr, makeId)
    : addr
}

function renderMailData(md: EmailData | readonly EmailData[]): string {
  if (Array.isArray(md)) {
    return md.map(renderMailData).join(", ")
  }
  if (typeof md === "string") {
    return md
  }
  return md.email
}

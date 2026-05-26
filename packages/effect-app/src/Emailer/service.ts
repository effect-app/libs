import type { NonEmptyReadonlyArray } from "../Array.js"
import * as Context from "../Context.js"
import type * as Effect from "../Effect.js"
import type { Email } from "../Schema.js"
import * as Data from "effect/Data"

export class SendMailError extends Data.TaggedError("SendMailError")<{
  readonly raw: Error
}> {}

export class Emailer extends Context.Opaque<Emailer, {
  sendMail: (msg: EmailMsgOptionalFrom) => Effect.Effect<void, SendMailError>
}>()("effect-app/Emailer") {}

export type EmailData = Email | {
 name?: string
 email: Email
}

export interface EmailContentPart {
 type: string
 value: string
}

export type EmailRecipients = EmailData | NonEmptyReadonlyArray<EmailData>

export interface EmailMsgBase extends Record<string, unknown> {
 readonly to: EmailRecipients
 readonly cc?: EmailRecipients
 readonly bcc?: EmailRecipients
 readonly from: EmailData
 readonly replyTo?: EmailData
 readonly subject?: string
 /**
  * should multiple `to` addresess be considered multiple emails?
  * defaults to `true`, not to leak email addresses
  */
 readonly isMultiple?: boolean
}

export type EmailContent =
 | { text: string }
 | { html: string }
 | { templateId: string }
 | { content: NonEmptyReadonlyArray<EmailContentPart> }

export type EmailMsg =
  & EmailMsgBase
  & EmailContent

export type EmailMsgOptionalFrom = Omit<EmailMsgBase, "from"> & Partial<Pick<EmailMsg, "from">> & EmailContent

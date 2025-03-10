// Not importing from /es/lib because they are .js files and bundlers probably assume they're cjs :(
import isEmail, { type IsEmailOptions } from "validator/lib/isEmail.js"

// Source https://emailregex.com/
// eslint-disable-next-line no-control-regex
// const EMAIL_REGEX = /^(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])$/

// allow for "/", "+", "-", " .js" and digits
const PHONE_REGEX = /^\+?[\d-/ ]*$/

const PHONE_LENGTH = 7

/**
 * Validate emails according to RFC 5322
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const isValidEmail = isEmail as any as (str: string, options?: IsEmailOptions) => boolean

/**
 * Validates that phone number contains at least 7 numbers.
 * Allowed characters are [0-1] "/", "+", "-", " .js"
 */
export const isValidPhone = (phone: string): boolean => {
  const isValidPhone = PHONE_REGEX.test(phone)
  if (!isValidPhone) return false

  const isValidLength = phone.split("").filter((c) => !isNaN(Number(c))).length >= PHONE_LENGTH
  if (!isValidLength) return false

  return true
}

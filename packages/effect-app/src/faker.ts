// FILE HAS SIDE EFFECTS!
import type { Faker } from "@faker-js/faker"

// eslint-disable-next-line prefer-const
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let faker: Faker = undefined as any as Faker

/**
 * @deprecated Schema generation now uses Effect's native `effect/Arbitrary`;
 * remove `setFaker(...)` calls and `@faker-js/faker` from downstream apps.
 */
export function setFaker(f: Faker) {
  faker = f
}

/**
 * @deprecated Schema generation now uses Effect's native `effect/Arbitrary`.
 */
export function getFaker() {
  if (!faker) throw new Error("You forgot to load faker library")
  return faker
}

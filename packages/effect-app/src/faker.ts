// FILE HAS SIDE EFFECTS!
import type { Faker } from "@faker-js/faker"

// TODO: inject faker differently, so we dont care about multiple instances of library.

// eslint-disable-next-line prefer-const
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let faker: Faker = undefined as any as Faker
export function setFaker(f: Faker) {
  faker = f
}

export function getFaker() {
  if (!faker) throw new Error("You forgot to load faker library")
  return faker
}

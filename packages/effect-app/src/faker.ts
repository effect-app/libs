// FILE HAS SIDE EFFECTS!
import type { Faker } from "@faker-js/faker"
import * as FC from "fast-check"

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

export const fakerToArb = <T>(fakerGen: () => T) => (fc: typeof FC) => {
  return FC.noBias(FC.noShrink(
    fc
      .integer()
      .map((seed) => {
        faker.seed(seed) // seed the generator
        return fakerGen() // call it
      })
  ))
}

export const fakerArb = <T>(
  gen: (fake: Faker) => () => T
): (a: any) => FC.Arbitrary<T> => fakerToArb(() => gen(getFaker())())

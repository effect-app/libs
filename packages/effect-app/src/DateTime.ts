import * as DateTime from "effect/DateTime"
import { pipe } from "effect/Function"

/**
 * The same instant as `date`, zoned with the process timezone.
 *
 * A JavaScript `Date` stores no zone. This attaches `DateTime.zoneMakeLocal()` without moving the instant.
 */
export const makeZonedLocal = (date: Date): DateTime.Zoned =>
  DateTime.makeZonedUnsafe(date, { timeZone: DateTime.zoneMakeLocal() })

/**
 * Zones `date` with the process timezone, runs `fns`, then returns the instant with `DateTime.toDateUtc`.
 *
 * The last function must return a `DateTime`. Calendar parts then follow the process timezone, as `Date#setDate` does.
 */
export function pipeZonedLocal(date: Date): Date
export function pipeZonedLocal<A extends DateTime.DateTime>(
  date: Date,
  ab: (self: DateTime.Zoned) => A
): Date
export function pipeZonedLocal<A, B extends DateTime.DateTime>(
  date: Date,
  ab: (self: DateTime.Zoned) => A,
  bc: (a: A) => B
): Date
export function pipeZonedLocal<A, B, C extends DateTime.DateTime>(
  date: Date,
  ab: (self: DateTime.Zoned) => A,
  bc: (a: A) => B,
  cd: (b: B) => C
): Date
export function pipeZonedLocal<A, B, C, D extends DateTime.DateTime>(
  date: Date,
  ab: (self: DateTime.Zoned) => A,
  bc: (a: A) => B,
  cd: (b: B) => C,
  de: (c: C) => D
): Date
export function pipeZonedLocal(
  date: Date,
  ab?: (self: DateTime.Zoned) => DateTime.DateTime,
  bc?: (a: DateTime.DateTime) => DateTime.DateTime,
  cd?: (a: DateTime.DateTime) => DateTime.DateTime,
  de?: (a: DateTime.DateTime) => DateTime.DateTime
): Date {
  const zoned = makeZonedLocal(date)
  const piped = de !== undefined && cd !== undefined && bc !== undefined && ab !== undefined
    ? pipe(zoned, ab, bc, cd, de)
    : cd !== undefined && bc !== undefined && ab !== undefined
    ? pipe(zoned, ab, bc, cd)
    : bc !== undefined && ab !== undefined
    ? pipe(zoned, ab, bc)
    : ab !== undefined
    ? pipe(zoned, ab)
    : zoned
  return DateTime.toDateUtc(piped)
}

import * as DateTime from "effect/DateTime"

/**
 * The same instant as `date`, zoned with the process timezone.
 *
 * A JavaScript `Date` stores no zone. This attaches `DateTime.zoneMakeLocal()` without moving the instant.
 */
export const makeZonedLocal = (date: Date): DateTime.Zoned =>
  DateTime.makeZonedUnsafe(date, { timeZone: DateTime.zoneMakeLocal() })

/**
 * Zones `date` with the process timezone, runs the functions, then returns the instant with `DateTime.toDateUtc`.
 *
 * Accepts as many functions as `pipe`. The last function must return a `DateTime`. Calendar parts follow the process timezone, as `Date#setDate` does.
 */
export function pipeZonedLocal(date: Date): Date
export function pipeZonedLocal<A extends DateTime.DateTime = never>(
  date: Date,
  ab: (self: DateTime.Zoned) => A
): Date
export function pipeZonedLocal<A = never, B extends DateTime.DateTime = never>(
  date: Date,
  ab: (self: DateTime.Zoned) => A,
  bc: (a: A) => B
): Date
export function pipeZonedLocal<A = never, B = never, C extends DateTime.DateTime = never>(
  date: Date,
  ab: (self: DateTime.Zoned) => A,
  bc: (a: A) => B,
  cd: (b: B) => C
): Date
export function pipeZonedLocal<
  A = never,
  B = never,
  C = never,
  D extends DateTime.DateTime = never
>(
  date: Date,
  ab: (self: DateTime.Zoned) => A,
  bc: (a: A) => B,
  cd: (b: B) => C,
  de: (c: C) => D
): Date
export function pipeZonedLocal<
  A = never,
  B = never,
  C = never,
  D = never,
  E extends DateTime.DateTime = never
>(
  date: Date,
  ab: (self: DateTime.Zoned) => A,
  bc: (a: A) => B,
  cd: (b: B) => C,
  de: (c: C) => D,
  ef: (d: D) => E
): Date
export function pipeZonedLocal<
  A = never,
  B = never,
  C = never,
  D = never,
  E = never,
  F extends DateTime.DateTime = never
>(
  date: Date,
  ab: (self: DateTime.Zoned) => A,
  bc: (a: A) => B,
  cd: (b: B) => C,
  de: (c: C) => D,
  ef: (d: D) => E,
  fg: (e: E) => F
): Date
export function pipeZonedLocal<
  A = never,
  B = never,
  C = never,
  D = never,
  E = never,
  F = never,
  G extends DateTime.DateTime = never
>(
  date: Date,
  ab: (self: DateTime.Zoned) => A,
  bc: (a: A) => B,
  cd: (b: B) => C,
  de: (c: C) => D,
  ef: (d: D) => E,
  fg: (e: E) => F,
  gh: (f: F) => G
): Date
export function pipeZonedLocal<
  A = never,
  B = never,
  C = never,
  D = never,
  E = never,
  F = never,
  G = never,
  H extends DateTime.DateTime = never
>(
  date: Date,
  ab: (self: DateTime.Zoned) => A,
  bc: (a: A) => B,
  cd: (b: B) => C,
  de: (c: C) => D,
  ef: (d: D) => E,
  fg: (e: E) => F,
  gh: (f: F) => G,
  hi: (g: G) => H
): Date
export function pipeZonedLocal<
  A = never,
  B = never,
  C = never,
  D = never,
  E = never,
  F = never,
  G = never,
  H = never,
  I extends DateTime.DateTime = never
>(
  date: Date,
  ab: (self: DateTime.Zoned) => A,
  bc: (a: A) => B,
  cd: (b: B) => C,
  de: (c: C) => D,
  ef: (d: D) => E,
  fg: (e: E) => F,
  gh: (f: F) => G,
  hi: (g: G) => H,
  ij: (h: H) => I
): Date
export function pipeZonedLocal<
  A = never,
  B = never,
  C = never,
  D = never,
  E = never,
  F = never,
  G = never,
  H = never,
  I = never,
  J extends DateTime.DateTime = never
>(
  date: Date,
  ab: (self: DateTime.Zoned) => A,
  bc: (a: A) => B,
  cd: (b: B) => C,
  de: (c: C) => D,
  ef: (d: D) => E,
  fg: (e: E) => F,
  gh: (f: F) => G,
  hi: (g: G) => H,
  ij: (h: H) => I,
  jk: (i: I) => J
): Date
export function pipeZonedLocal<
  A = never,
  B = never,
  C = never,
  D = never,
  E = never,
  F = never,
  G = never,
  H = never,
  I = never,
  J = never,
  K extends DateTime.DateTime = never
>(
  date: Date,
  ab: (self: DateTime.Zoned) => A,
  bc: (a: A) => B,
  cd: (b: B) => C,
  de: (c: C) => D,
  ef: (d: D) => E,
  fg: (e: E) => F,
  gh: (f: F) => G,
  hi: (g: G) => H,
  ij: (h: H) => I,
  jk: (i: I) => J,
  kl: (j: J) => K
): Date
export function pipeZonedLocal<
  A = never,
  B = never,
  C = never,
  D = never,
  E = never,
  F = never,
  G = never,
  H = never,
  I = never,
  J = never,
  K = never,
  L extends DateTime.DateTime = never
>(
  date: Date,
  ab: (self: DateTime.Zoned) => A,
  bc: (a: A) => B,
  cd: (b: B) => C,
  de: (c: C) => D,
  ef: (d: D) => E,
  fg: (e: E) => F,
  gh: (f: F) => G,
  hi: (g: G) => H,
  ij: (h: H) => I,
  jk: (i: I) => J,
  kl: (j: J) => K,
  lm: (k: K) => L
): Date
export function pipeZonedLocal<
  A = never,
  B = never,
  C = never,
  D = never,
  E = never,
  F = never,
  G = never,
  H = never,
  I = never,
  J = never,
  K = never,
  L = never,
  M extends DateTime.DateTime = never
>(
  date: Date,
  ab: (self: DateTime.Zoned) => A,
  bc: (a: A) => B,
  cd: (b: B) => C,
  de: (c: C) => D,
  ef: (d: D) => E,
  fg: (e: E) => F,
  gh: (f: F) => G,
  hi: (g: G) => H,
  ij: (h: H) => I,
  jk: (i: I) => J,
  kl: (j: J) => K,
  lm: (k: K) => L,
  mn: (l: L) => M
): Date
export function pipeZonedLocal<
  A = never,
  B = never,
  C = never,
  D = never,
  E = never,
  F = never,
  G = never,
  H = never,
  I = never,
  J = never,
  K = never,
  L = never,
  M = never,
  N extends DateTime.DateTime = never
>(
  date: Date,
  ab: (self: DateTime.Zoned) => A,
  bc: (a: A) => B,
  cd: (b: B) => C,
  de: (c: C) => D,
  ef: (d: D) => E,
  fg: (e: E) => F,
  gh: (f: F) => G,
  hi: (g: G) => H,
  ij: (h: H) => I,
  jk: (i: I) => J,
  kl: (j: J) => K,
  lm: (k: K) => L,
  mn: (l: L) => M,
  no: (m: M) => N
): Date
export function pipeZonedLocal<
  A = never,
  B = never,
  C = never,
  D = never,
  E = never,
  F = never,
  G = never,
  H = never,
  I = never,
  J = never,
  K = never,
  L = never,
  M = never,
  N = never,
  O extends DateTime.DateTime = never
>(
  date: Date,
  ab: (self: DateTime.Zoned) => A,
  bc: (a: A) => B,
  cd: (b: B) => C,
  de: (c: C) => D,
  ef: (d: D) => E,
  fg: (e: E) => F,
  gh: (f: F) => G,
  hi: (g: G) => H,
  ij: (h: H) => I,
  jk: (i: I) => J,
  kl: (j: J) => K,
  lm: (k: K) => L,
  mn: (l: L) => M,
  no: (m: M) => N,
  op: (n: N) => O
): Date
export function pipeZonedLocal<
  A = never,
  B = never,
  C = never,
  D = never,
  E = never,
  F = never,
  G = never,
  H = never,
  I = never,
  J = never,
  K = never,
  L = never,
  M = never,
  N = never,
  O = never,
  P extends DateTime.DateTime = never
>(
  date: Date,
  ab: (self: DateTime.Zoned) => A,
  bc: (a: A) => B,
  cd: (b: B) => C,
  de: (c: C) => D,
  ef: (d: D) => E,
  fg: (e: E) => F,
  gh: (f: F) => G,
  hi: (g: G) => H,
  ij: (h: H) => I,
  jk: (i: I) => J,
  kl: (j: J) => K,
  lm: (k: K) => L,
  mn: (l: L) => M,
  no: (m: M) => N,
  op: (n: N) => O,
  pq: (o: O) => P
): Date
export function pipeZonedLocal<
  A = never,
  B = never,
  C = never,
  D = never,
  E = never,
  F = never,
  G = never,
  H = never,
  I = never,
  J = never,
  K = never,
  L = never,
  M = never,
  N = never,
  O = never,
  P = never,
  Q extends DateTime.DateTime = never
>(
  date: Date,
  ab: (self: DateTime.Zoned) => A,
  bc: (a: A) => B,
  cd: (b: B) => C,
  de: (c: C) => D,
  ef: (d: D) => E,
  fg: (e: E) => F,
  gh: (f: F) => G,
  hi: (g: G) => H,
  ij: (h: H) => I,
  jk: (i: I) => J,
  kl: (j: J) => K,
  lm: (k: K) => L,
  mn: (l: L) => M,
  no: (m: M) => N,
  op: (n: N) => O,
  pq: (o: O) => P,
  qr: (p: P) => Q
): Date
export function pipeZonedLocal<
  A = never,
  B = never,
  C = never,
  D = never,
  E = never,
  F = never,
  G = never,
  H = never,
  I = never,
  J = never,
  K = never,
  L = never,
  M = never,
  N = never,
  O = never,
  P = never,
  Q = never,
  R extends DateTime.DateTime = never
>(
  date: Date,
  ab: (self: DateTime.Zoned) => A,
  bc: (a: A) => B,
  cd: (b: B) => C,
  de: (c: C) => D,
  ef: (d: D) => E,
  fg: (e: E) => F,
  gh: (f: F) => G,
  hi: (g: G) => H,
  ij: (h: H) => I,
  jk: (i: I) => J,
  kl: (j: J) => K,
  lm: (k: K) => L,
  mn: (l: L) => M,
  no: (m: M) => N,
  op: (n: N) => O,
  pq: (o: O) => P,
  qr: (p: P) => Q,
  rs: (q: Q) => R
): Date
export function pipeZonedLocal<
  A = never,
  B = never,
  C = never,
  D = never,
  E = never,
  F = never,
  G = never,
  H = never,
  I = never,
  J = never,
  K = never,
  L = never,
  M = never,
  N = never,
  O = never,
  P = never,
  Q = never,
  R = never,
  S extends DateTime.DateTime = never
>(
  date: Date,
  ab: (self: DateTime.Zoned) => A,
  bc: (a: A) => B,
  cd: (b: B) => C,
  de: (c: C) => D,
  ef: (d: D) => E,
  fg: (e: E) => F,
  gh: (f: F) => G,
  hi: (g: G) => H,
  ij: (h: H) => I,
  jk: (i: I) => J,
  kl: (j: J) => K,
  lm: (k: K) => L,
  mn: (l: L) => M,
  no: (m: M) => N,
  op: (n: N) => O,
  pq: (o: O) => P,
  qr: (p: P) => Q,
  rs: (q: Q) => R,
  st: (r: R) => S
): Date
export function pipeZonedLocal(date: Date, ...steps: ReadonlyArray<(value: any) => any>): Date {
  let current: unknown = makeZonedLocal(date)
  for (const step of steps) {
    current = step(current)
  }
  if (!DateTime.isDateTime(current)) {
    throw new TypeError("pipeZonedLocal must finish on a DateTime")
  }
  return DateTime.toDateUtc(current)
}

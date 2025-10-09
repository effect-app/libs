import crypto from "crypto"
import { Effect } from "effect-app"
import type { Abortable } from "events"
import type { Mode, ObjectEncodingOptions, OpenMode } from "fs"
import fs from "fs/promises"
import os from "os"
import path from "path"
import lockfile from "proper-lockfile"
import type internal from "stream"

export function readFile(fileName: string) {
  return Effect.tryPromise(() => fs.readFile(fileName))
}

export function createReadableStream(fileName: string) {
  return Effect.map(openFile(fileName), (file) => file.createReadStream())
}

export function openFile(fileName: string) {
  return Effect.acquireRelease(Effect.tryPromise(() => fs.open(fileName)), (f) => Effect.promise(() => f.close()))
}

export function tempFile(
  folder: string
) {
  return (prefix: string) => (data: Data, options?: FileOptions) => tempFile_(folder, prefix, data, options)
}

type Data =
  | string
  | NodeJS.ArrayBufferView
  | Iterable<string | NodeJS.ArrayBufferView>
  | AsyncIterable<string | NodeJS.ArrayBufferView>
  | internal.Stream

export type FileOptions =
  | (ObjectEncodingOptions & {
    mode?: Mode | undefined
    flag?: OpenMode | undefined
  } & Abortable)
  | BufferEncoding
  | null
export function tempFile_(
  folder: string,
  prefix: string,
  data: Data,
  options?: FileOptions
) {
  return Effect.flatMap(
    Effect
      .sync(() => path.join(os.tmpdir(), folder, `${prefix}-` + crypto.randomUUID())),
    (fp) =>
      Effect.acquireRelease(
        Effect
          .map(
            Effect
              .tryPromise(() => fs.writeFile(fp, data, options)),
            (_) => fp
          ),
        (p) => Effect.promise(() => fs.unlink(p))
      )
  )
}

/**
 * Safe write file to .tmp and then rename
 */
export function writeTextFile(fileName: string, content: string) {
  const tmp = fileName + ".tmp"
  return Effect
    .andThen(
      Effect
        .tryPromise(() => fs.writeFile(tmp, content, "utf-8")),
      Effect.tryPromise(() => fs.rename(tmp, fileName))
    )
    .pipe(Effect.orDie)
}

export function fileExists(fileName: string) {
  return Effect.orDie(Effect
    .tryPromise(() => fs.stat(fileName).then((_) => _.isFile())))
}

export function readTextFile(fileName: string) {
  return Effect.tryPromise(() => fs.readFile(fileName, "utf-8"))
}

/**
 * Executes an action with an exclusive cross-process file lock.
 * Uses proper-lockfile for robust lock management with stale lock detection,
 * retry logic, and cross-platform support.
 *
 * @param filePath - The file to lock (will create {filePath}.lock)
 * @param action - The Effect to execute while holding the lock
 * @returns The result of the action
 */
export function withFileLock<A, E, R>(
  filePath: string,
  action: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> {
  return Effect
    .gen(function*() {
      // get lock
      const release = yield* Effect
        .tryPromise(() =>
          lockfile.lock(filePath, {
            retries: {
              retries: 100, // retry up to 100 times
              minTimeout: 50, // start with 50ms delay
              maxTimeout: 2000, // max 2s delay between retries
              randomize: true // add randomness to avoid thundering herd
            },
            stale: 10000, // lock is stale after 10s (process crashed)
            realpath: false // don't resolve symlinks
          })
        )
        .pipe(Effect.orDie)

      // ensure lock is released
      yield* Effect.addFinalizer(() =>
        Effect
          .tryPromise(release)
          .pipe(Effect.orDie)
      )

      return yield* action
    })
    .pipe(Effect.scoped)
}

import crypto from "crypto"
import * as Effect from "effect-app/Effect"
import * as Data from "effect/Data"
import type { Abortable } from "events"
import type { Mode, ObjectEncodingOptions, OpenMode } from "fs"
import fs from "fs/promises"
import os from "os"
import path from "path"
import lockfile from "proper-lockfile"
import type internal from "stream"

export class FileUtilError extends Data.TaggedError("FileUtilError")<{ readonly cause: unknown }> {}

const tryFs = <A>(evaluate: () => Promise<A>) =>
  Effect.tryPromise({
    try: evaluate,
    catch: (cause) => new FileUtilError({ cause })
  })

export function readFile(fileName: string) {
  return tryFs(() => fs.readFile(fileName))
}

export function createReadableStream(fileName: string) {
  return Effect.map(openFile(fileName), (file) => file.createReadStream())
}

export function openFile(fileName: string) {
  return Effect.acquireRelease(tryFs(() => fs.open(fileName)), (f) => Effect.promise(() => f.close()))
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
            tryFs(() => fs.writeFile(fp, data, options)),
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
  return Effect.andThen(
    Effect.promise(() => fs.writeFile(tmp, content, "utf-8")),
    Effect.promise(() => fs.rename(tmp, fileName))
  )
}

export function fileExists(fileName: string) {
  return Effect.promise(() => fs.stat(fileName).then((_) => _.isFile()))
}

export function readTextFile(fileName: string) {
  return tryFs(() => fs.readFile(fileName, "utf-8"))
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
      const release = yield* Effect.promise(() =>
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

      // ensure lock is released
      yield* Effect.addFinalizer(() =>
        // we have to make sure we use a thunk, or the library will cause problems because effect passes abortsignal as first argument
        Effect.promise(() => release())
      )

      return yield* action
    })
    .pipe(Effect.scoped)
}

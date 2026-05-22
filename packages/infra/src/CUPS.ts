import { type FileOptions, tempFile } from "@effect-app/infra/fileUtil"
import cp from "child_process"
import * as Config from "effect-app/Config"
import * as Context from "effect-app/Context"
import * as Effect from "effect-app/Effect"
import * as Layer from "effect-app/Layer"
import * as Option from "effect-app/Option"
import * as S from "effect-app/Schema"
import { pretty } from "effect-app/utils"
import * as Data from "effect/Data"
import * as Predicate from "effect/Predicate"
import fs from "fs"
import os from "os"
import path from "path"
import util from "util"
import { InfraLogger } from "./logger.js"

export const PrinterId = S.NonEmptyString255
export type PrinterId = S.NonEmptyString255

type ExecError = Error & {
  code?: number | string
  killed?: boolean
  signal?: NodeJS.Signals | null
  cmd?: string
  stdout?: string
  stderr?: string
}

export class CUPSError extends Data.TaggedError("CUPSError")<{
  readonly command: string
  readonly message: string
  readonly code: number | string | undefined
  readonly signal: NodeJS.Signals | null | undefined
  readonly killed: boolean | undefined
  readonly stdout: string | undefined
  readonly stderr: string | undefined
  readonly cause: unknown
}> {}

const exec_ = util.promisify(cp.exec)
const exec = (command: string) =>
  Effect.andThen(
    InfraLogger.logDebug(`Executing: ${command}`),
    Effect.tap(
      Effect.tryPromise({
        try: () => exec_(command),
        catch: (cause) => {
          const e = cause as ExecError
          return new CUPSError({
            command,
            message: e?.message ?? String(cause),
            code: e?.code,
            signal: e?.signal,
            killed: e?.killed,
            stdout: e?.stdout,
            stderr: e?.stderr,
            cause
          })
        }
      }),
      (r) => (InfraLogger.logDebug(`Executed`).pipe(Effect.annotateLogs("result", pretty(r))))
    )
  )

type PrinterConfig = { url?: URL | undefined; id: string }

function printFile(printer: PrinterConfig | undefined, options: string[]) {
  return (filePath: string) => printFile_(filePath, printer, options)
}

function printFile_(filePath: string, printer: PrinterConfig | undefined, options: string[]) {
  return exec(["lp", ...buildPrintArgs(filePath, printer, options)].join(" "))
}

function* buildPrintArgs(filePath: string, printer: PrinterConfig | undefined, options: string[]) {
  if (printer) {
    if (printer.url) {
      yield `-h ${printer.url.host}`
      if (printer.url.username) {
        yield `-U ${printer.url.username}`
      }
    }
    yield `-d "${printer.id}"`
    for (const o of options) {
      yield `-o ${o}`
    }
  }
  yield `"${filePath}"`
}

export const prepareTempDir = Effect.sync(() => {
  // TODO
  try {
    fs.mkdirSync(path.join(os.tmpdir(), "effect-ts-app"))
  } catch (err) {
    if (`${err}`.includes("EEXIST")) {
      return
    }
    throw err
  }
})

const makeTempFile = tempFile("effect-ts-app")
export const makePrintJobTempFile = makeTempFile("print-job")
export const makePrintJobTempFileArrayBuffer = (buffer: ArrayBuffer, options?: FileOptions) =>
  makePrintJobTempFile(Buffer.from(buffer), options)

function printBuffer(printer: PrinterConfig, options: string[]) {
  return (buffer: ArrayBuffer) =>
    makePrintJobTempFileArrayBuffer(buffer)
      .pipe(
        Effect.flatMap(printFile(printer, options)),
        Effect.scoped
      )
}

const getAvailablePrinters = Effect.fnUntraced(function*(host?: string) {
  const { stdout } = yield* exec(["lpstat", ...buildListArgs({ host }), "-s"].join(" "))
  return [...stdout.matchAll(/device for (\w+):/g)]
    .map((_) => _[1])
    .filter(Predicate.isNotNullish)
    .map((_) => S.NonEmptyString255(_))
})

function* buildListArgs(config?: { host?: string | undefined }) {
  if (config?.host) {
    yield `-h ${config.host}`
  }
}

export const CUPSConfig = Config.all({
  server: Config
    .string("server")
    .pipe(
      Config.map((s) => new URL(s)),
      Config.option,
      Config.nested("cups")
    )
})

export class CUPS extends Context.Service<CUPS>()("effect-app/CUPS", {
  make: Effect.gen(function*() {
    const config = yield* CUPSConfig
    const serverUrl = Option.getOrUndefined(config.server)
    function print(buffer: ArrayBuffer, printerId: PrinterId, ...options: string[]) {
      const _print = printBuffer({
        id: printerId,
        url: serverUrl
      }, options)
      return _print(buffer)
    }
    return {
      print,
      printFile: (filePath: string, printerId: PrinterId, ...options: string[]) =>
        printFile({
          id: printerId,
          url: serverUrl
        }, options)(filePath),
      getAvailablePrinters: getAvailablePrinters(serverUrl?.host)
    }
  })
}) {
  static readonly Fake = Layer.effect(
    this,
    Effect.sync(() =>
      CUPS.of({
        print: (buffer: ArrayBuffer, printerId: PrinterId, ...options: string[]) =>
          InfraLogger
            .logInfo("Printing to fake printer")
            .pipe(
              Effect.andThen(Effect.sync(() => ({ stdout: "fake", stderr: "" }))),
              Effect
                .annotateLogs({
                  printerId,
                  "options": pretty(options),
                  "bufferSize": buffer.byteLength.toString()
                })
            ),
        printFile: (filePath: string, printerId: PrinterId, ...options: string[]) =>
          InfraLogger
            .logInfo("Printing to fake printer")
            .pipe(
              Effect.andThen(Effect.sync(() => ({ stdout: "fake", stderr: "" }))),
              Effect
                .annotateLogs({
                  printerId,
                  filePath,
                  "options": pretty(options)
                })
            ),
        getAvailablePrinters: Effect.sync(() => [])
      })
    )
  )
}

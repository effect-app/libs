import { type FileOptions, tempFile } from "@effect-app/infra/fileUtil"
import cp from "child_process"
import { Config, Effect, Layer, Predicate, S } from "effect-app"
import { pretty } from "effect-app/utils"
import fs from "fs"
import os from "os"
import path from "path"
import util from "util"
import { InfraLogger } from "./logger.js"

export const PrinterId = S.NonEmptyString255
export type PrinterId = S.NonEmptyString255

const exec_ = util.promisify(cp.exec)
const exec = (command: string) =>
  Effect.andThen(
    InfraLogger.logDebug(`Executing: ${command}`),
    Effect.tap(
      Effect
        .tryPromise(() => exec_(command)),
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

function getAvailablePrinters(host?: string) {
  return Effect.gen(function*() {
    const { stdout } = yield* exec(["lpstat", ...buildListArgs({ host }), "-s"].join(" "))
    return [...stdout.matchAll(/device for (\w+):/g)]
      .map((_) => _[1])
      .filter(Predicate.isNotNullable)
      .map((_) => S.NonEmptyString255(_))
  })
}

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

export class CUPS extends Effect.Service<CUPS>()("effect-app/CUPS", {
  effect: Effect.gen(function*() {
    const config = yield* CUPSConfig
    function print(buffer: ArrayBuffer, printerId: PrinterId, ...options: string[]) {
      const _print = printBuffer({
        id: printerId,
        url: config.server.value
      }, options)
      return _print(buffer)
    }
    return {
      print,
      printFile: (filePath: string, printerId: PrinterId, ...options: string[]) =>
        printFile({
          id: printerId,
          url: config.server.value
        }, options)(filePath),
      getAvailablePrinters: getAvailablePrinters(config.server.value?.host)
    }
  })
}) {
  static readonly Fake = Layer.effect(
    this,
    Effect.sync(() => {
      return this.make({
        print: (buffer, printerId, ...options) =>
          InfraLogger
            .logInfo("Printing to fake printer")
            .pipe(
              Effect.zipRight(Effect.sync(() => ({ stdout: "fake", stderr: "" }))),
              Effect
                .annotateLogs({
                  printerId,
                  "options": pretty(options),
                  "bufferSize": buffer.byteLength.toString()
                })
            ),
        printFile: (filePath, printerId, ...options) =>
          InfraLogger
            .logInfo("Printing to fake printer")
            .pipe(
              Effect.zipRight(Effect.sync(() => ({ stdout: "fake", stderr: "" }))),
              Effect
                .annotateLogs({
                  printerId,
                  filePath,
                  "options": pretty(options)
                })
            ),
        getAvailablePrinters: Effect.sync(() => [])
      })
    })
  )
}

/**
 * Example: stream-based mutation for a long-running operation.
 *
 * The server streams a tagged union of progress updates and a final result.
 * The Vue ref is updated for every emitted value; `AsyncResult` stays in the
 * `waiting` state until the stream ends.
 *
 * When using `makeClient` / `clientFor`, stream-type requests are exposed as
 * `mutateStream` on the client object (and as `XxxStream` in `.helpers`).
 * The example below shows both the low-level `asStreamResult` API and how the
 * same functionality appears on the generated client.
 */
import { Effect, S, Stream } from "effect-app"
import { asStreamResult } from "../src/mutate.js"

// ---------------------------------------------------------------------------
// Domain model
// ---------------------------------------------------------------------------

/** Intermediate progress report, e.g. "5 of 400 items processed". */
export class OperationProgress extends S.TaggedClass<OperationProgress>()("OperationProgress", {
  completed: S.NonNegativeInt,
  total: S.NonNegativeInt
}) {}

/** The final result produced once the operation is complete. */
export class ExportComplete extends S.TaggedClass<ExportComplete>()("ExportComplete", {
  fileUrl: S.NonEmptyString
}) {}

/** Tagged union emitted by the stream. */
export type ExportEvent = OperationProgress | ExportComplete

// ---------------------------------------------------------------------------
// Simulated stream (replace with a real RPC / SSE stream in production)
// ---------------------------------------------------------------------------

/**
 * Produces `total` progress updates followed by a single `ExportComplete`.
 * Each step is separated by a 50 ms delay to simulate real async work.
 */
const makeExportStream = (total: S.NonNegativeInt): Stream.Stream<ExportEvent> =>
  Stream.concat(
    Stream.range(1, total).pipe(
      Stream.map((completed) => new OperationProgress({ completed: S.NonNegativeInt(completed), total })),
      Stream.tap(() => Effect.sleep("50 millis"))
    ),
    Stream.make(new ExportComplete({ fileUrl: S.NonEmptyString("https://example.com/export.csv") }))
  )

// ---------------------------------------------------------------------------
// Option A: low-level `asStreamResult` (call inside a `setup()` function)
// ---------------------------------------------------------------------------

export const useExportMutation = () => {
  /**
   * `result`   - reactive ref, always reflects the latest stream event.
   *              `AsyncResult` tag:
   *                - Initial (waiting=true)  - operation in progress
   *                - Success (waiting=true)  - progress update received, still running
   *                - Success (waiting=false) - final result, operation complete
   *                - Failure                 - operation failed
   *
   * `execute`  - call with the desired `total` to kick off the stream.
   */
  const [result, execute] = asStreamResult((total: S.NonNegativeInt) => makeExportStream(total))

  return { result, execute }
}

// ---------------------------------------------------------------------------
// Option B: via `makeClient` / `clientFor` (stream requests -> `mutateStream`)
//
// When a request schema has `type: "stream"`, `clientFor` exposes:
//
//   client.exportData.mutateStream
//   // -> (options?) => ((input: I) => Effect<Final, never, R>) & { id, running?, progress? }
//   // Always invoke `()` (optionally with `{ progress }`) to get a fresh callable.
//   const execute = client.exportData.mutateStream()
//   const executeWithProgress = client.exportData.mutateStream({
//     progress: (r) => r._tag === "Success" ? `${r.value.completed}/${r.value.total}` : undefined
//   })
//   // The callable can also be passed directly to Command.fn / Command.wrap / Command.wrapStream.
//
// which wraps `asStreamResult(client.exportData.handler)` internally.
//
// The `.helpers` object also includes `exportDataStream` (the camelCase key
// plus "Stream" suffix) with the same factory shape.
// ---------------------------------------------------------------------------

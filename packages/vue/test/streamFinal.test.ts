/**
 * Runtime and type tests for the `final` schema on stream requests.
 *
 * The `final` option on a stream request schema lets callers model which type
 * the last emitted stream element is.
 */
import { expect, it } from "@effect/vitest"
import { Effect, S } from "effect-app"
import * as Stream from "effect/Stream"
import { asStreamResult } from "../src/mutate.js"
import { ExportComplete, OperationProgress, Something } from "./stubs.js"

// ---------------------------------------------------------------------------
// asStreamResult — low-level primitive, always returns void
// ---------------------------------------------------------------------------

it.live("asStreamResult returns void and updates ref with each element", () =>
  Effect.gen(function*() {
    const events: number[] = [1, 2, 3]
    const [ref, execute] = asStreamResult(() => Stream.fromIterable(events))

    yield* execute()

    // ref should hold the last emitted value
    expect(ref.value._tag).toBe("Success")
    if (ref.value._tag === "Success") {
      expect(ref.value.value).toBe(3)
      expect(ref.value.waiting).toBe(false)
    }
  }))

it("stream request without final: .final is undefined", () => {
  const req = Something.StreamWithoutFinal
  expect((req as any).final).toBeUndefined()
})

it("stream request with final: .final holds the ExportComplete schema", () => {
  const req = Something.StreamWithFinal
  expect((req as any).final).toBeDefined()
  // Verify the schema decodes correctly
  const decoded = S.decodeUnknownSync((req as any).final)({ _tag: "ExportComplete", fileUrl: "https://x.com" })
  expect(decoded).toBeInstanceOf(ExportComplete)
})

// ---------------------------------------------------------------------------
// Runtime: last stream value is accessible via the reactive ref after stream ends
// ---------------------------------------------------------------------------

it.live("last stream value is accessible via reactive ref after stream ends", () =>
  Effect.gen(function*() {
    const progress = new OperationProgress({ completed: 1 as S.NonNegativeInt, total: 2 as S.NonNegativeInt })
    const complete = new ExportComplete({ fileUrl: "https://example.com/file.csv" as S.NonEmptyString })

    const [ref, execute] = asStreamResult(() => Stream.make(progress, complete))

    yield* execute()

    expect(ref.value._tag).toBe("Success")
    if (ref.value._tag === "Success") {
      expect(ref.value.value).toBe(complete)
      expect(ref.value.waiting).toBe(false)
    }
  }))

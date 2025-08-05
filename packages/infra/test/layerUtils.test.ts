import { expectTypeOf, expectTypeOf, it } from "@effect/vitest"
import { type Layer } from "effect"
import { type LayerUtils } from "../src/api/layerUtils.js"

it("works", () => {
  // not supported atm, resolves to unknown!
  // type None = LayerUtils.GetLayersContext<any[]>
  type B = (Layer.Layer<void, "error-a", "a"> | Layer.Layer<void, "error-b", "b">)[]
  type C = LayerUtils.GetLayersContext<B>
  type CE = LayerUtils.GetLayersError<B>

  expectTypeOf({} as C).toEqualTypeOf<"a" | "b">()
  expectTypeOf({} as CE).toEqualTypeOf<"error-a" | "error-b">()
  // expectTypeOf({} as None).toEqualTypeOf<never>()

  type B2 = [Layer.Layer<void, "error-a", "a">, Layer.Layer<void, "error-b", "b"> | Layer.Layer<void, "error-c", "c">]
  type C2 = LayerUtils.GetLayersContext<B2>
  type CE2 = LayerUtils.GetLayersError<B2>
  expectTypeOf({} as C2).toEqualTypeOf<"a" | "b" | "c">()
  expectTypeOf({} as CE2).toEqualTypeOf<"error-a" | "error-b" | "error-c">()
})

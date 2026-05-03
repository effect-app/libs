import { it, expect } from "@effect/vitest"
import { isGeneratorFunction } from "effect-app/utils"
// Also import isObject directly to test
import { isObject } from "effect-app/utils"

it("debug: test what genConstructor sees vs our gen constructor", () => {
  const gen = function*(arg: number) {
    yield arg
    return arg * 2
  }
  
  const localGenCon = (function*() {}).constructor
  
  // isGeneratorFunction uses genConstructor captured at module load time
  // in its own realm. Let's check if isObject passes at least.
  console.log("isObject(gen):", isObject(gen))
  console.log("gen.constructor === localGenCon:", gen.constructor === localGenCon)
  
  // Maybe the issue is that commander.ts creates generator functions
  // and they're in a different realm than test's function*
  // Let's check: does isGeneratorFunction work for an Effect.gen body?
  const fromEffect = function*(x: number) { return x }
  console.log("isGeneratorFunction(fromEffect):", isGeneratorFunction(fromEffect))
  console.log("fromEffect.constructor === localGenCon:", fromEffect.constructor === localGenCon)
  
  // Expose what isGeneratorFunction's realm sees:
  // Pass our gen to it
  console.log("isGeneratorFunction(gen):", isGeneratorFunction(gen))
  
  // Test: is it a realm issue? Try creating a generator in the commander module's realm
  // by importing something from commander and seeing what it returns
  expect(true).toBe(true)
})

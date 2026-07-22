import { mount } from "@vue/test-utils"
import { CauseException } from "effect-app/client"
import * as Cause from "effect/Cause"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { defineComponent, h, nextTick, onErrorCaptured, ref } from "vue"
import { createMemoryHistory, createRouter, type Router } from "vue-router"
import FixedNuxtErrorBoundary from "./FixedNuxtErrorBoundary.vue"

/**
 * Behavior contract of the shared error boundary (extracted from the two
 * app-local copies — this pins the "no behavior change" claim of the dedup):
 *  - a supported error (e.g. thrown in setup) renders the error slot and
 *    emits "error"; it is NOT reported via captureException
 *  - an unsupported error (e.g. native event handler) is reported via
 *    captureException (+ toast when debug) and does NOT take over the page
 *  - an interrupts-only Effect CauseException is ignored entirely
 *  - a route change clears the error state
 *  - scheduleAfterReady defers handling (backend hydration path)
 *  - enabled=false registers no handler, so errors propagate to the parent
 */

const noopWarn = () => {}

// Throws in setup only while `active` is true — a supported error ("setup
// function"), and togglable so the route-change test can stop re-throwing.
const makeThrowingChild = (active: { value: boolean }, err: unknown) =>
  defineComponent({
    name: "ThrowingChild",
    setup() {
      if (active.value) throw err
      return () => h("div", { id: "child-ok" }, "ok")
    }
  })

// Throws from a native click handler — an unsupported error info.
const ClickThrowChild = defineComponent({
  name: "ClickThrowChild",
  setup() {
    return () =>
      h("button", {
        id: "boom",
        onClick: () => {
          throw new Error("click boom")
        }
      }, "boom")
  }
})

const makeRouter = () =>
  createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: { render: () => null } },
      { path: "/other", component: { render: () => null } }
    ]
  })

describe("FixedNuxtErrorBoundary", () => {
  let captureException: ReturnType<typeof vi.fn>
  let toastError: ReturnType<typeof vi.fn>
  let router: Router
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    captureException = vi.fn()
    toastError = vi.fn()
    router = makeRouter()
    warnSpy = vi.spyOn(console, "warn").mockImplementation(noopWarn)
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  // Mount through a host component that renders the boundary with its slots,
  // mirroring real usage (Suspender wraps it). Mounting the boundary directly
  // as the test root breaks error propagation into its own onErrorCaptured.
  const mountBoundary = (
    child: ReturnType<typeof defineComponent>,
    props: Record<string, unknown> = {}
  ) => {
    const emitted: Error[] = []
    const Host = defineComponent({
      name: "Host",
      setup() {
        return () =>
          h(FixedNuxtErrorBoundary, {
            captureException,
            toastError,
            debug: true,
            onError: (e: Error) => emitted.push(e),
            ...props
          }, {
            default: () => h(child),
            error: (params: { error: Error; clearError: () => void }) =>
              h("div", { id: "error-slot" }, params.error.message)
          })
      }
    })
    const wrapper = mount(Host, { global: { plugins: [router] } })
    return { wrapper, emitted }
  }

  it("renders the error slot and emits on a supported (setup) error, without reporting it", async () => {
    const active = ref(true)
    const { emitted, wrapper } = mountBoundary(makeThrowingChild(active, new Error("setup boom")))
    await nextTick()

    expect(wrapper.find("#error-slot").exists()).toBe(true)
    expect(wrapper.find("#error-slot").text()).toBe("setup boom")
    expect(emitted).toHaveLength(1)
    expect(captureException).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalled()
  })

  it("reports an unsupported (native handler) error via captureException + toast, without taking over the page", async () => {
    const { emitted, wrapper } = mountBoundary(ClickThrowChild)
    await wrapper.find("#boom").trigger("click")
    await nextTick()

    expect(captureException).toHaveBeenCalledTimes(1)
    expect(captureException.mock.calls[0][0]).toBeInstanceOf(Error)
    expect(toastError).toHaveBeenCalledWith("An unexpected error has occurred: Error: click boom")
    expect(wrapper.find("#error-slot").exists()).toBe(false)
    expect(emitted).toHaveLength(0)
  })

  it("does not toast an unsupported error when debug is off", async () => {
    const { wrapper } = mountBoundary(ClickThrowChild, { debug: false })
    await wrapper.find("#boom").trigger("click")

    expect(captureException).toHaveBeenCalledTimes(1)
    expect(toastError).not.toHaveBeenCalled()
  })

  it("ignores an interrupts-only Effect CauseException", async () => {
    const interrupted = new CauseException(Cause.interrupt(), "Interrupted")
    const { emitted, wrapper } = mountBoundary(makeThrowingChild(ref(true), interrupted))
    await nextTick()

    expect(wrapper.find("#error-slot").exists()).toBe(false)
    expect(emitted).toHaveLength(0)
    expect(captureException).not.toHaveBeenCalled()
  })

  it("clears the error on route change", async () => {
    const active = ref(true)
    const { wrapper } = mountBoundary(makeThrowingChild(active, new Error("boom")))
    await nextTick()
    expect(wrapper.find("#error-slot").exists()).toBe(true)

    active.value = false
    await router.push("/other")
    await nextTick()

    expect(wrapper.find("#error-slot").exists()).toBe(false)
    expect(wrapper.find("#child-ok").exists()).toBe(true)
  })

  it("defers handling through scheduleAfterReady when provided", async () => {
    const queue: (() => void)[] = []
    const { wrapper } = mountBoundary(makeThrowingChild(ref(true), new Error("deferred boom")), {
      scheduleAfterReady: (fn: () => void) => queue.push(fn)
    })
    await nextTick()

    expect(wrapper.find("#error-slot").exists()).toBe(false)
    expect(queue).toHaveLength(1)

    queue.forEach((fn) => fn())
    await nextTick()
    expect(wrapper.find("#error-slot").text()).toBe("deferred boom")
  })

  it("calls onHandled after emitting, before rendering the error slot", async () => {
    const onHandled = vi.fn()
    const { wrapper } = mountBoundary(makeThrowingChild(ref(true), new Error("hooked boom")), { onHandled })
    await nextTick()

    expect(onHandled).toHaveBeenCalledTimes(1)
    expect(onHandled.mock.calls[0][0]).toBeInstanceOf(Error)
    expect(onHandled.mock.calls[0][2]).toBe("setup function")
    expect(wrapper.find("#error-slot").exists()).toBe(true)
  })

  it("registers no handler when enabled is false, letting the error propagate", async () => {
    const parentCaught = vi.fn()
    const Host = defineComponent({
      name: "Host",
      setup() {
        onErrorCaptured((err) => {
          parentCaught(err)
          return false
        })
        return () =>
          h(FixedNuxtErrorBoundary, {
            captureException,
            toastError,
            debug: true,
            enabled: false
          }, {
            default: () => h(makeThrowingChild(ref(true), new Error("escaped boom"))),
            error: () => h("div", { id: "error-slot" })
          })
      }
    })
    const wrapper = mount(Host, { global: { plugins: [router] } })
    await nextTick()

    expect(parentCaught).toHaveBeenCalledTimes(1)
    expect(wrapper.find("#error-slot").exists()).toBe(false)
  })
})

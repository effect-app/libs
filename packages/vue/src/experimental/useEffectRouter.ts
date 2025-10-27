/* eslint-disable @typescript-eslint/no-explicit-any */
import { Effect } from "effect-app"
import { type RouteLocationAsPath, type RouteLocationAsRelative, type RouteLocationAsRelativeTyped, type RouteLocationAsString, type RouteLocationNormalizedLoaded, type RouteLocationRaw, type RouteLocationResolved, type RouteMap, type Router as VueRouter, type RouteRecordNameGeneric, type RouteRecordRaw, useRouter } from "vue-router"

/**
 * Effectified version of `useRouter`
 */
export const useEffectRouter = () => {
  const r: VueRouter = useRouter()
  const effectified = {
    ...r,
    back: Effect.sync(() => r.back()),
    forward: Effect.sync(() => r.forward()),
    replace: (to: RouteLocationRaw) => Effect.promise(() => r.replace(to)),
    push: (to: RouteLocationRaw) => Effect.promise(() => r.push(to)),
    isReady: Effect.promise(() => r.isReady())
  }
  return effectified
}

export class Router extends Effect.Service<Router>()("Router", {
  sync: useEffectRouter,
  accessors: true
}) {
  static readonly addRoute: {
    /**
     * Add a new {@link RouteRecordRaw | route record} as the child of an existing route.
     *
     * @param parentName - Parent Route Record where `route` should be appended at
     * @param route - Route Record to add
     */
    (
      parentName: NonNullable<RouteRecordNameGeneric>,
      route: RouteRecordRaw
    ): Effect.Effect<void, never, Router>
    /**
     * Add a new {@link RouteRecordRaw | route record} to the router.
     *
     * @param route - Route Record to add
     */
    (route: RouteRecordRaw): Effect.Effect<void, never, Router>
  } = ((...args: any[]) => Router.use((_) => _.addRoute(...(args as [any, any])))) as any

  static override readonly resolve: {
    /**
     * Returns the {@link RouteLocation | normalized version} of a
     * {@link RouteLocationRaw | route location}. Also includes an `href` property
     * that includes any existing `base`. By default, the `currentLocation` used is
     * `router.currentRoute` and should only be overridden in advanced use cases.
     *
     * @param to - Raw route location to resolve
     * @param currentLocation - Optional current location to resolve against
     */
    <Name extends keyof RouteMap = keyof RouteMap>(
      to: RouteLocationAsRelativeTyped<RouteMap, Name>,
      currentLocation?: RouteLocationNormalizedLoaded
    ): Effect.Effect<RouteLocationResolved<Name>, never, Router>
    (
      to: RouteLocationAsString | RouteLocationAsRelative | RouteLocationAsPath,
      currentLocation?: RouteLocationNormalizedLoaded
    ): Effect.Effect<RouteLocationResolved, never, Router>
  } = (...args: any[]) => Router.use((_) => _.resolve(...(args as [any, any])))
}

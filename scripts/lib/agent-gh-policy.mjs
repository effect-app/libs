/**
 * Agent policy for `gh`: recognise the invocations that publish a pull request
 * (undraft / ready-for-review side channels) so the shim can run the ship gate
 * before letting them through. Publishing is gated, never refused — only a
 * failing gate stops it. `pnpm pr:ready` sets AGENT_PR_SHIP=1 so its own undraft
 * call does not re-run the gate it just passed.
 */
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

const truthy = (v) => {
  if (v == null || v === "") return false
  const s = String(v).toLowerCase()
  return s !== "0" && s !== "false" && s !== "no" && s !== "off"
}

/** @param {NodeJS.ProcessEnv} [env] */
export const isAgentPrShipAllowed = (env = process.env) => truthy(env["AGENT_PR_SHIP"])

/**
 * Strip leading global `gh` flags so subcommands are at the front.
 * @param {string[]} argv
 */
export const stripGhGlobalFlags = (argv) => {
  const args = [...argv]
  const skipValue = new Set([
    "-R",
    "--repo",
    "-h",
    "--hostname",
    "-p",
    "--path",
    "--config-dir"
  ])
  while (args.length > 0) {
    const a = args[0]
    if (a === "--") {
      args.shift()
      break
    }
    if (!a.startsWith("-")) break
    if (a.includes("=") && (a.startsWith("-R=") || a.startsWith("--repo=") || a.startsWith("--hostname="))) {
      args.shift()
      continue
    }
    if (skipValue.has(a)) {
      args.shift()
      if (args.length > 0) args.shift()
      continue
    }
    // Unknown global flag with possible value — stop rather than mis-parse.
    if (a.startsWith("-") && args.length > 1 && !args[1].startsWith("-") && !a.includes("=")) {
      // boolean globals like --help stay; leave them for gh
      break
    }
    args.shift()
  }
  return args
}

/**
 * @param {string[]} argv  args after the gh binary name
 * @param {NodeJS.ProcessEnv} [env]
 * Does this `gh` invocation publish a pull request, and therefore have to pass
 * the ship gate first?
 *
 * Refusing outright enforced the gate by making the agent remember a second
 * command — forget it and you get an error, not a validated PR.
 *
 * @returns {{ required: boolean, reason?: string }}
 */
export const requiresShipGate = (argv, env = process.env) => {
  if (isAgentPrShipAllowed(env)) return { required: false }

  const args = stripGhGlobalFlags(argv)
  if (args.length === 0) return { required: false }

  // gh pr ready [number]
  if (args[0] === "pr" && args[1] === "ready") {
    return {
      required: true,
      reason: "`gh pr ready` publishes this PR — running the ship gate first"
    }
  }

  // REST / GraphQL undraft side channels via `gh api`
  if (args[0] === "api") {
    const joined = args.join(" ")
    if (/ready_for_review/i.test(joined) || /markPullRequestReadyForReview/i.test(joined)) {
      return {
        required: true,
        reason: "this `gh api` call publishes a PR — running the ship gate first"
      }
    }
  }

  return { required: false }
}

/**
 * Resolve the real `gh` binary, skipping this policy shim when it is on PATH.
 * @param {{ env?: NodeJS.ProcessEnv, selfPath?: string }} [opts]
 * @returns {string | null}
 */
export const findRealGh = (opts = {}) => {
  const env = opts.env ?? process.env
  if (env["AGENT_GH_REAL"] && fs.existsSync(env["AGENT_GH_REAL"])) {
    return env["AGENT_GH_REAL"]
  }

  const selfPath = opts.selfPath
    ? path.resolve(opts.selfPath)
    : fileURLToPath(import.meta.url)

  const pathEnv = env["PATH"] ?? ""
  for (const dir of pathEnv.split(path.delimiter).filter(Boolean)) {
    for (const name of ["gh", "gh.real"]) {
      const candidate = path.join(dir, name)
      try {
        if (!fs.existsSync(candidate)) continue
        const resolved = fs.realpathSync(candidate)
        // Skip our shim (scripts/agent-gh.mjs launched via .tools/bin/gh).
        if (resolved === selfPath) continue
        if (resolved.endsWith(`${path.sep}agent-gh.mjs`)) continue
        if (resolved.includes(`${path.sep}.tools${path.sep}bin${path.sep}gh`)) continue
        // Prefer executables; on Windows skip the check.
        try {
          fs.accessSync(candidate, fs.constants.X_OK)
        } catch {
          continue
        }
        return candidate
      } catch {
        // try next
      }
    }
  }

  // Last resort: ask the shell (may return us — caller must detect loops).
  const which = spawnSync("bash", ["-lc", "command -v gh"], {
    encoding: "utf8",
    env,
    shell: false
  })
  if (which.status === 0) {
    const p = which.stdout.trim()
    if (p && !p.endsWith("agent-gh.mjs") && !p.includes(`${path.sep}.tools${path.sep}bin${path.sep}gh`)) {
      return p
    }
  }
  return null
}

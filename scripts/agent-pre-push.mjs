#!/usr/bin/env node
/**
 * Native git `pre-push` entry for coding agents only.
 *
 * Humans: no-op (exit 0) — self-responsible; not forced by the hook.
 *
 * Agents: every push runs the gate — draft, ready, or no PR at all. Publishing
 * runs the same gate whichever way it is reached: `pnpm pr:ready` explicitly, or
 * raw `gh pr ready`, which the shim gates rather than refuses.
 *
 * Ship gate — the JS quality path CI runs, and nothing else:
 *   1. `pnpm check`  — tsgo --build ./tsconfig.all.json
 *   2. `pnpm lint`
 *   3. `pnpm test`   — pnpm -r --no-bail test:run
 *
 * This is a library monorepo: there is no application to stand up and no browser
 * suite, so the unit run is the whole story. That keeps the gate honest about
 * being the same thing CI runs (`ci.yml` runs `pnpm lint` and `pnpm test`)
 * rather than a superset nobody else executes — and it is why draft pushes are
 * not exempted here: there is no expensive half to defer, only the checks that
 * decide whether the pushed commit is worth anyone's attention. The SHA cache
 * below keeps that from being paid twice.
 *
 * Checks run **once**, at the right moment: the validated HEAD SHA is cached
 * under `.run/`, so a commit is never re-validated because it was pushed twice.
 * Agents should not hand-run these separately.
 *
 * Detection: GROK_AGENT / T3_AGENT / AI_AGENT / Claude / Cursor / Codex env.
 * Humans only: SKIP_AGENT_PREPUSH=1 git push
 * Agents must never set that flag or use git push --no-verify.
 */
import { spawnSync } from "node:child_process"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"
import { isCodingAgent } from "./lib/agent-env.mjs"
import { isShipGateForce, isShipGateShaCached, readHeadSha, readShipGateCache, writeShipGateCache } from "./lib/agent-ship-gate-cache.mjs"

export { isCodingAgent }

/**
 * The gate shells out to workspace binaries that live in `node_modules/.bin`.
 * pnpm and the hook both put that on PATH, so every caller happens to work and
 * the dependency stays invisible — until something runs the gate from a bare
 * process, where it dies with "command not found". Supply it explicitly so the
 * gate does not depend on how it was invoked.
 *
 * @param {string} root
 * @param {NodeJS.ProcessEnv} env
 */
const withRepoBin = (root, env) => {
  const repoBin = path.join(root, "node_modules", ".bin")
  const current = (env["PATH"] ?? "").split(path.delimiter).filter(Boolean)
  if (current.some((entry) => path.resolve(entry) === repoBin)) return env
  return { ...env, PATH: [repoBin, ...current].join(path.delimiter) }
}

const run = (label, args, opts = {}) => {
  console.error(`agent ship-gate: ${label}`)
  const result = spawnSync(args[0], args.slice(1), {
    stdio: "inherit",
    shell: true,
    cwd: opts.cwd ?? process.cwd(),
    env: opts.env ?? process.env
  })
  const status = result.status === null ? 1 : result.status
  if (status !== 0) {
    console.error(`agent ship-gate: failed: ${label} (exit ${status})`)
    process.exit(status)
  }
}

export const isWorktreeClean = (root = process.cwd(), opts = {}) => {
  const runGit = opts.runGit
    ?? ((args, runOpts) => spawnSync("git", args, { cwd: runOpts.cwd, encoding: "utf8", shell: false }))
  const result = runGit(["status", "--porcelain=v1", "--untracked-files=normal"], { cwd: root })
  return result.status === 0 && String(result.stdout ?? "").trim() === ""
}

/**
 * Shared by pre-push (every agent push) and `pnpm pr:ready`. Caches the
 * validated HEAD SHA so push + publish never double-run for the same commit.
 * Force: AGENT_SHIP_GATE_FORCE=1.
 *
 * @param {{ root?: string, force?: boolean, env?: NodeJS.ProcessEnv }} [opts]
 * @returns {Promise<{ status: "cached" | "ok", sha: string | null }>}
 */
export const runAgentShipGate = async (opts = {}) => {
  const root = opts.root ?? process.cwd()
  const env = withRepoBin(root, opts.env ?? process.env)
  const force = opts.force === true || isShipGateForce(env)
  const headSha = readHeadSha(root)

  if (!isWorktreeClean(root)) {
    console.error("agent ship-gate: worktree is dirty — commit the changes, then push again")
    process.exit(1)
  }

  if (!force && headSha && isShipGateShaCached(headSha, readShipGateCache(root))) {
    console.error(
      `agent ship-gate: skip — ${
        headSha.slice(0, 12)
      } already validated (cache .run/agent-ship-gate.json; force with AGENT_SHIP_GATE_FORCE=1)`
    )
    return { status: "cached", sha: headSha }
  }

  run("pnpm check", ["pnpm", "check"], { cwd: root, env })
  run("pnpm lint", ["pnpm", "lint"], { cwd: root, env })
  run("pnpm test", ["pnpm", "test"], { cwd: root, env })

  if (!isWorktreeClean(root)) {
    console.error("agent ship-gate: validation rewrote files — commit the changes, then push again")
    process.exit(1)
  }

  if (headSha) {
    try {
      writeShipGateCache(root, headSha)
      console.error(`agent ship-gate: cached ${headSha.slice(0, 12)} (.run/agent-ship-gate.json)`)
    } catch (error) {
      console.error(`agent ship-gate: could not write cache: ${error?.message ?? error}`)
    }
  }

  console.error("agent ship-gate: ok")
  return { status: "ok", sha: headSha }
}

const thisFile = fileURLToPath(import.meta.url)
const invokedAs = process.argv[1] ? path.resolve(process.argv[1]) : ""

if (invokedAs === thisFile) {
  if (!isCodingAgent()) process.exit(0)

  // No PR-state lookup: the gate runs on every push, so what `gh` would say
  // cannot change the outcome.
  await runAgentShipGate({ root: process.cwd() })
  process.exit(0)
}

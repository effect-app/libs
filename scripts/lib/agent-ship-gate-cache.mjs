/**
 * Persist the last HEAD SHA that passed the agent ship gate.
 * pre-push and `pnpm pr:ready` share this so the same commit is never double-paid.
 *
 * Path: `.run/agent-ship-gate.json` (under gitignored `.run/`).
 */
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import process from "node:process"

export const SHIP_GATE_CACHE_REL = path.join(".run", "agent-ship-gate.json")

/** @param {string} [root] */
export const shipGateCachePath = (root = process.cwd()) => path.join(root, SHIP_GATE_CACHE_REL)

/**
 * @param {string} [root]
 * @param {{ runGit?: (args: string[], opts: { cwd: string }) => { status: number | null, stdout: string } }} [opts]
 * @returns {string | null} full SHA or null
 */
export const readHeadSha = (root = process.cwd(), opts = {}) => {
  const runGit = opts.runGit
    ?? ((args, runOpts) => {
      const result = spawnSync("git", args, {
        encoding: "utf8",
        cwd: runOpts.cwd,
        shell: false
      })
      return { status: result.status, stdout: result.stdout ?? "" }
    })
  const result = runGit(["rev-parse", "HEAD"], { cwd: root })
  if (result.status !== 0) return null
  const sha = String(result.stdout).trim()
  return /^[0-9a-f]{40}$/i.test(sha) ? sha.toLowerCase() : null
}

/**
 * @param {string} [root]
 * @param {{ readFileSync?: typeof fs.readFileSync }} [opts]
 * @returns {{ sha?: string, validatedAt?: string, automatedSha?: string, automatedAt?: string } | null}
 */
export const readShipGateCache = (root = process.cwd(), opts = {}) => {
  const readFileSync = opts.readFileSync ?? fs.readFileSync
  const file = shipGateCachePath(root)
  try {
    const raw = readFileSync(file, "utf8")
    const parsed = JSON.parse(raw)
    const parsedSha = typeof parsed?.sha === "string" ? parsed.sha.trim().toLowerCase() : ""
    const parsedAutomatedSha = typeof parsed?.automatedSha === "string"
      ? parsed.automatedSha.trim().toLowerCase()
      : ""
    const sha = /^[0-9a-f]{40}$/i.test(parsedSha) ? parsedSha : undefined
    const automatedSha = /^[0-9a-f]{40}$/i.test(parsedAutomatedSha) ? parsedAutomatedSha : sha
    if (!sha && !automatedSha) return null
    return {
      sha,
      validatedAt: typeof parsed.validatedAt === "string" ? parsed.validatedAt : undefined,
      automatedSha,
      automatedAt: typeof parsed.automatedAt === "string"
        ? parsed.automatedAt
        : typeof parsed.validatedAt === "string"
        ? parsed.validatedAt
        : undefined
    }
  } catch {
    return null
  }
}

/**
 * @param {string} root
 * @param {string} sha
 * @param {{ stage?: "automated" | "complete", writeFileSync?: typeof fs.writeFileSync, mkdirSync?: typeof fs.mkdirSync, now?: () => Date }} [opts]
 */
export const writeShipGateCache = (root, sha, opts = {}) => {
  const writeFileSync = opts.writeFileSync ?? fs.writeFileSync
  const mkdirSync = opts.mkdirSync ?? fs.mkdirSync
  const now = opts.now ?? (() => new Date())
  const normalized = String(sha).trim().toLowerCase()
  if (!/^[0-9a-f]{40}$/i.test(normalized)) {
    throw new Error(`writeShipGateCache: invalid sha ${sha}`)
  }
  const file = shipGateCachePath(root)
  const at = now().toISOString()
  const value = opts.stage === "automated"
    ? { automatedSha: normalized, automatedAt: at }
    : { sha: normalized, validatedAt: at, automatedSha: normalized, automatedAt: at }
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

/**
 * @param {string | null | undefined} headSha
 * @param {{ sha: string } | null | undefined} cache
 */
export const isShipGateShaCached = (headSha, cache) => {
  if (!headSha || !cache?.sha) return false
  return headSha.toLowerCase() === cache.sha.toLowerCase()
}

/**
 * @param {string | null | undefined} headSha
 * @param {{ automatedSha?: string, sha?: string } | null | undefined} cache
 */
export const isShipGateAutomationCached = (headSha, cache) => {
  if (!headSha) return false
  const cachedSha = cache?.automatedSha ?? cache?.sha
  return Boolean(cachedSha && headSha.toLowerCase() === cachedSha.toLowerCase())
}

/**
 * Force re-run even when SHA is cached.
 * @param {NodeJS.ProcessEnv} [env]
 */
export const isShipGateForce = (env = process.env) => {
  const v = env["AGENT_SHIP_GATE_FORCE"]
  if (v == null || v === "") return false
  const s = String(v).toLowerCase()
  return s !== "0" && s !== "false" && s !== "no" && s !== "off"
}

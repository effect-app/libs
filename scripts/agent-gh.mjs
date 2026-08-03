#!/usr/bin/env node
/**
 * Agent-facing `gh` policy shim.
 *
 * Installed at `.tools/bin/gh` by `scripts/install-git-hooks.mjs`.
 * When coding-agent env markers are set and the command would publish a PR
 * (`gh pr ready`, ready_for_review API), the ship gate runs first and the command
 * then proceeds. Only a failing gate stops it — publishing is gated, not
 * forbidden. `pnpm pr:ready` remains the explicit path; it sets AGENT_PR_SHIP=1
 * so the gate runs once, not twice.
 *
 * Humans / non-agents: transparent pass-through to the next `gh` on PATH.
 */
import { spawnSync } from "node:child_process"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"
import { isCodingAgent } from "./lib/agent-env.mjs"
import { findRealGh, requiresShipGate } from "./lib/agent-gh-policy.mjs"

const selfPath = fileURLToPath(import.meta.url)
const argv = process.argv.slice(2)

let shipping = false

if (isCodingAgent()) {
  const gate = requiresShipGate(argv)
  if (gate.required) {
    console.error(`agent gh: ${gate.reason}`)
    // Lazy: `gh` is on the hot path for ordinary commands and must not pay for
    // the gate's dependencies just to run `gh pr view`.
    const { runAgentShipGate } = await import("./agent-pre-push.mjs")
    // Exits non-zero itself when a check fails, so a red gate stops the publish
    // and a green one falls through to the real `gh` below.
    await runAgentShipGate({ root: process.cwd() })
    shipping = true
  }
}

const realGh = findRealGh({ selfPath })
if (!realGh) {
  console.error("agent gh: could not resolve real `gh` binary (set AGENT_GH_REAL)")
  process.exit(127)
}

// Avoid re-entering this shim if PATH still prefers us.
const env = { ...process.env }
const toolsBin = path.resolve(path.dirname(selfPath), "..", ".tools", "bin")
const pathParts = (env["PATH"] ?? "").split(path.delimiter).filter(Boolean)
env["PATH"] = pathParts.filter((p) => path.resolve(p) !== toolsBin).join(path.delimiter)
env["AGENT_GH_REAL"] = realGh
// The gate passed, so anything this command spawns is already cleared to ship.
if (shipping) env["AGENT_PR_SHIP"] = "1"

const result = spawnSync(realGh, argv, {
  stdio: "inherit",
  env,
  shell: false
})
process.exit(result.status === null ? 1 : result.status)

/**
 * Shared agent-env detection (pre-push, gh shim, pr:ready).
 */
import process from "node:process"

const truthy = (v) => {
  if (v == null || v === "") return false
  const s = String(v).toLowerCase()
  return s !== "0" && s !== "false" && s !== "no" && s !== "off"
}

/** @param {NodeJS.ProcessEnv} env */
export const isCodingAgent = (env = process.env) => {
  if (truthy(env["SKIP_AGENT_PREPUSH"])) return false
  return (
    truthy(env["GROK_AGENT"])
    || truthy(env["T3_AGENT"])
    || truthy(env["AI_AGENT"])
    || truthy(env["CLAUDECODE"])
    || truthy(env["CLAUDE_CODE"])
    || truthy(env["CURSOR_AGENT"])
    || truthy(env["CURSOR_TRACE_ID"])
    || truthy(env["CODEX_CI"])
    || truthy(env["CODEX_SANDBOX"])
  )
}

/**
 * Resolve the current branch's open PR state, for the publish path (`pnpm
 * pr:ready` / the `gh` shim). Pushes do not consult it: the gate runs on all of
 * them.
 *
 * Modes:
 *   none    — no open PR (or closed/merged)
 *   draft   — open draft PR: publishing undrafts it after the gate
 *   ready   — open non-draft PR
 *   unknown — gh missing / failed: fail closed
 */
import { spawnSync } from "node:child_process"
import process from "node:process"

/**
 * @param {{ isDraft?: boolean, state?: string } | null | undefined} pr
 * @returns {"none" | "draft" | "ready"}
 */
export const classifyPrPayload = (pr) => {
  if (pr == null) return "none"
  const state = String(pr.state ?? "").toUpperCase()
  if (state === "CLOSED" || state === "MERGED") return "none"
  if (pr.isDraft === true) return "draft"
  return "ready"
}

/**
 * @param {{
 *   cwd?: string
 *   env?: NodeJS.ProcessEnv
 *   runGh?: (args: string[], opts: { cwd: string, env: NodeJS.ProcessEnv }) =>
 *     { status: number | null, stdout: string, stderr: string }
 * }} [opts]
 * @returns {{ mode: "none" | "draft" | "ready" | "unknown", pr: { number?: number, url?: string, isDraft?: boolean, state?: string } | null, detail?: string }}
 */
/** Strip ANSI color codes so `gh --json` stays parseable when color is forced. */
const stripAnsi = (text) => String(text).replace(/\u001b\[[0-9;]*m/g, "")

/** Return the JSON object while ignoring shell integration noise around it. */
const extractJsonObject = (text) => {
  const cleaned = stripAnsi(text).trim()
  const start = cleaned.indexOf("{")
  const end = cleaned.lastIndexOf("}")
  if (start === -1 || end === -1 || end < start) return cleaned
  return cleaned.slice(start, end + 1)
}

export const resolveOpenPrState = (opts = {}) => {
  const cwd = opts.cwd ?? process.cwd()
  const env = { ...(opts.env ?? process.env) }
  delete env.FORCE_COLOR
  delete env.CLICOLOR_FORCE
  env.NO_COLOR = "1"
  env.CLICOLOR = "0"
  env.GH_FORCE_TTY = "0"
  env.TERM = "dumb"
  const runGh = opts.runGh
    ?? ((args, runOpts) => {
      const result = spawnSync("gh", args, {
        encoding: "utf8",
        cwd: runOpts.cwd,
        env: runOpts.env,
        shell: false
      })
      return {
        status: result.status,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
        error: result.error
      }
    })

  const result = runGh(
    ["pr", "view", "--json", "number,url,isDraft,state"],
    { cwd, env }
  )

  if (result.error && result.error.code === "ENOENT") {
    return { mode: "unknown", pr: null, detail: "gh not found on PATH" }
  }

  const status = result.status === null ? 1 : result.status
  const stderr = stripAnsi(result.stderr ?? "").trim()
  const stdout = extractJsonObject(result.stdout ?? "")

  // No PR for this branch — free push (open a draft when ready to share).
  if (status !== 0) {
    const combined = `${stderr}\n${stdout}`.toLowerCase()
    if (
      combined.includes("no pull requests found")
      || combined.includes("could not resolve to a pullrequest")
      || combined.includes("no pr found")
      || combined.includes("not found")
    ) {
      return { mode: "none", pr: null, detail: stderr.trim() || "no open PR" }
    }
    return {
      mode: "unknown",
      pr: null,
      detail: stderr.trim() || stdout || `gh pr view exited ${status}`
    }
  }

  if (!stdout) {
    return { mode: "unknown", pr: null, detail: "gh pr view returned empty JSON" }
  }

  try {
    const pr = JSON.parse(stdout)
    const mode = classifyPrPayload(pr)
    return { mode, pr, detail: mode === "none" ? `PR ${pr.number} is ${pr.state}` : undefined }
  } catch (error) {
    return {
      mode: "unknown",
      pr: null,
      detail: `failed to parse gh pr view JSON: ${error?.message ?? error}`
    }
  }
}

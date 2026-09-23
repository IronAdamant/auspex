/** Optional agent dispatch. Extra receipt key; schema v1 required keys stay unchanged. */

export const NEXT_CALL_TOOLS = [
  "auspex_login",
  "auspex_reap",
  "auspex_await_login",
  "auspex_finalize_login",
  "auspex_job",
] as const

export type NextCallTool = (typeof NEXT_CALL_TOOLS)[number]

/** Written beside the sentence that chooses it. Not parsed back out of that sentence. */
export type NextCall = {
  tool: NextCallTool
  profile?: string
  saveEditor?: boolean
  url?: string
  expect?: string
  jobId?: string
}

export type NextCallKind =
  | "login-remint"
  | "login-host"
  | "await-save-editor"
  | "await-retry"
  | "finalize"
  | "reap"
  | "job-resume"

export type NextCallOpts = {
  profile?: string
  url?: string
  expect?: string
  jobId?: string
}

function named(profile?: string): string | undefined {
  const name = profile?.trim()
  return name && name !== "<name>" && name !== "<yours>" ? name : undefined
}

/** One constructor for every door-card / fail-closed nextCall. */
export function nextCallFor(kind: NextCallKind, opts: NextCallOpts = {}): NextCall {
  const profile = named(opts.profile)
  const url = opts.url?.trim() || undefined
  const expect = opts.expect?.trim() || undefined
  switch (kind) {
    case "login-remint": {
      const nextCall: NextCall = { tool: "auspex_login" }
      if (profile) nextCall.profile = profile
      return nextCall
    }
    case "login-host": {
      const nextCall: NextCall = { tool: "auspex_login" }
      if (profile) nextCall.profile = profile
      if (url) nextCall.url = url
      return nextCall
    }
    case "await-save-editor": {
      const nextCall: NextCall = { tool: "auspex_await_login", saveEditor: true }
      if (profile) nextCall.profile = profile
      return nextCall
    }
    case "await-retry": {
      const nextCall: NextCall = { tool: "auspex_await_login" }
      if (profile) nextCall.profile = profile
      return nextCall
    }
    case "finalize": {
      const nextCall: NextCall = { tool: "auspex_finalize_login" }
      if (profile) nextCall.profile = profile
      if (url) nextCall.url = url
      if (expect) nextCall.expect = expect
      return nextCall
    }
    case "reap":
      return { tool: "auspex_reap" }
    case "job-resume": {
      const nextCall: NextCall = { tool: "auspex_job", jobId: opts.jobId ?? "" }
      if (profile) nextCall.profile = profile
      return nextCall
    }
  }
}

export function remintLoginNextCall(profile?: string): NextCall {
  return nextCallFor("login-remint", { profile })
}

export function hostChangeNextCall(profile: string, url: string): NextCall {
  return nextCallFor("login-host", { profile, url })
}

export function awaitSaveEditorNextCall(profile?: string): NextCall {
  return nextCallFor("await-save-editor", { profile })
}

export function awaitRetryNextCall(profile?: string): NextCall {
  return nextCallFor("await-retry", { profile })
}

export function finalizeLoginNextCall(profile?: string, opts: { url?: string; expect?: string } = {}): NextCall {
  return nextCallFor("finalize", { profile, url: opts.url, expect: opts.expect })
}

export function reapNextCall(): NextCall {
  return nextCallFor("reap")
}

export function resumeJobNextCall(jobId: string, profile?: string): NextCall {
  return nextCallFor("job-resume", { jobId, profile })
}

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

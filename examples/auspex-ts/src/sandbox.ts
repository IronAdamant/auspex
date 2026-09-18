import { SolariClient } from "@solarisdk/sdk"
import { runCheck, runDirFromResult, type CheckOptions, type CheckResult } from "./check.ts"
import { MAX_IMAGE_BYTES } from "./content.ts"
import { AuspexError, classifySolariError, explainSolariError } from "./errors.ts"
import { shouldVerifyAfterCheck } from "./fail-closed.ts"
import { noopProgress, type ProgressFn } from "./progress.ts"
import { forgetLive, rememberLive } from "./session-ledger.ts"
import { assertRunDirUnderRuns, findLatestRun, loadRunFiles, RECEIPT_ASSERT_PY } from "./receipt.ts"
import { createClient, fetchWithIdempotencyKey, launchBrowser, OVERALL_TIMEOUT_MS, pageForSession, requireApiKey, resolveProfileId } from "./solari.ts"
import { sessionCreateFromCheck } from "./launch-options.ts"
import { boundPromise, closeThenRelease, CLOSE_TIMEOUT_MS, observeAbort, raceWithTimeout, ReadyRelease } from "./timeout.ts"
import { haystackMatches, normalizeHaystack } from "./text.ts"
import { hydrateSessionStorage } from "./profile-storage.ts"

export const SANDBOX_ASSERT_TIMEOUT_MS = 60_000
export const VERIFY_OVERALL_MS = 90_000
/** Nested check + session-close + verify-overall budgets. Must stay ≤ Auspex MCP tool_timeout_sec. */
export const CHECK_THEN_VERIFY_WORST_MS = OVERALL_TIMEOUT_MS + CLOSE_TIMEOUT_MS + VERIFY_OVERALL_MS

export const SANDBOX_CREATE_OPTS = {
  template: "base",
  cpu: 1,
  memMb: 2048,
  timeoutMs: 5 * 60_000,
  lifecycle: { onTimeout: "kill" as const },
}

export type VerifyResult = {
  ok: boolean
  errors: string[]
  claimOk: boolean
  claimErrors: string[]
  anonymousClaimSkipped?: boolean
  claimOkProfile?: boolean
  claimErrorsProfile?: string[]
  claimProfileSessionId?: string
  finalUrl?: string
  runDir: string
  sandboxId?: string
  skipped?: boolean
  skipReason?: string
}

export type SandboxHandle = {
  connect: () => Promise<void>
  files: {
    mkdir: (p: string) => Promise<void>
    write: (p: string, data: string | Uint8Array) => Promise<void>
  }
  commands: {
    run: (
      cmd: string,
      opts: { args: string[] },
    ) => Promise<{ exitCode: number; stdout?: string; stderr?: string }>
  }
  kill: () => Promise<void>
  sandboxId?: string
}

export type VerifyDeps = {
  create: () => Promise<SandboxHandle>
  onProgress?: ProgressFn
  overallMs?: number
  skipAnonymousClaim?: boolean
  profileClaimCheck?: (opts: {
    finalUrl: string
    expect: string
    profileId: string
  }) => Promise<{ claimOk: boolean; claimErrors: string[]; sessionId?: string }>
}

type RestSandbox = {
  id: string
  commands: SandboxHandle["commands"]
  kill: () => Promise<void>
  uploadUrl: (path?: string) => Promise<{ url: string }>
}

/** Skip the control-WS handshake: mkdir/run use REST /exec; writes use signed PUT. */
export function wrapSandboxRestExec(sbx: RestSandbox, fetchImpl: typeof fetch = fetch): SandboxHandle {
  return {
    connect: async () => undefined,
    files: {
      mkdir: async (p) => {
        await sbx.commands.run("mkdir", { args: ["-p", p] })
      },
      write: async (p, data) => {
        const { url } = await sbx.uploadUrl(p)
        const body = typeof data === "string" ? Buffer.from(data) : Buffer.from(data)
        const res = await fetchImpl(url, { method: "PUT", body })
        if (!res.ok) throw new Error(`upload ${p} failed: ${res.status}`)
      },
    },
    commands: sbx.commands,
    kill: () => sbx.kill(),
    sandboxId: sbx.id,
  }
}

export function defaultVerifyDeps(): VerifyDeps {
  return {
    create: async () => {
      const pt = new SolariClient({ apiKey: requireApiKey(), fetch: fetchWithIdempotencyKey() })
      const sbx = await pt.sandboxes.create(SANDBOX_CREATE_OPTS)
      return wrapSandboxRestExec(sbx as unknown as RestSandbox)
    },
    profileClaimCheck: defaultProfileClaimCheck,
  }
}

export async function defaultProfileClaimCheck(opts: {
  finalUrl: string
  expect: string
  profileId: string
}): Promise<{ claimOk: boolean; claimErrors: string[]; sessionId?: string }> {
  const solari = createClient()
  const closer = new ReadyRelease()
  let sessionId = ""
  try {
    const browser = await launchBrowser(solari, sessionCreateFromCheck({ profileId: opts.profileId }), new AbortController().signal)
    closer.set(async () => {
      await closeThenRelease(
        () => browser.close(),
        async () => {
          await solari.sessions.releaseAndWait(browser.id)
        },
        CLOSE_TIMEOUT_MS,
      )
    })
    sessionId = browser.id
    await rememberLive("browser", sessionId).catch(() => undefined)
    const page = await pageForSession(browser)
    await page.goto(opts.finalUrl, {
      timeout: 45_000,
      waitUntil: "domcontentloaded",
    })
    await hydrateSessionStorage(page)
    try {
      await page.waitForLoadState("networkidle", { timeout: 20_000 })
    } catch {
      // network idle optional for claim check
    }
    await new Promise((resolve) => setTimeout(resolve, 2000))
    let raw = await page.evaluate(() => document.body?.innerText ?? "")
    if (!raw.trim() || raw.length < 50) {
      await new Promise((resolve) => setTimeout(resolve, 3000))
      raw = await page.evaluate(() => document.body?.innerText ?? "")
    }
    const matched = haystackMatches(raw, opts.expect)
    closer.skip()
    await closer.release()
    await forgetLive("browser", sessionId).catch(() => undefined)
    const errors = matched ? [] : ["profile-seeded check: page text does not contain expect"]
    if (!matched && raw.trim()) {
      const snippet = raw.trim().slice(0, 200).replace(/\s+/g, " ")
      errors.push(`(sampled: "${snippet}${raw.length > 200 ? "..." : ""}")`)
    }
    return {
      claimOk: matched,
      claimErrors: errors,
      sessionId,
    }
  } catch (err) {
    try {
      closer.skip()
      await closer.release()
      if (sessionId) await forgetLive("browser", sessionId).catch(() => undefined)
    } catch {
      // original error wins
    }
    return {
      claimOk: false,
      claimErrors: [`profile-seeded check failed: ${explainSolariError(err)}`],
      sessionId: sessionId || undefined,
    }
  } finally {
    await solari.close().catch(() => undefined)
  }
}

export function assertReceiptUploadSize(
  manifest: string,
  png: Buffer,
  cap = MAX_IMAGE_BYTES,
): void {
  const n = Buffer.byteLength(manifest, "utf8") + png.length
  if (png.length > cap || n > cap) {
    throw new Error(`receipt exceeds ${cap} bytes`)
  }
}

export function parseAssertStdout(stdout: string): {
  ok: boolean
  errors: string[]
  claimOk: boolean
  claimErrors: string[]
  anonymousClaimSkipped?: boolean
  finalUrl?: string
} {
  const line = stdout.trim().split("\n").filter(Boolean).at(-1) ?? ""
  if (!line) {
    return { ok: false, errors: ["sandbox produced no stdout"], claimOk: false, claimErrors: [] }
  }
  try {
    const parsed = JSON.parse(line) as {
      ok?: boolean
      errors?: string[]
      claimOk?: boolean
      claimErrors?: string[]
      anonymousClaimSkipped?: boolean
      finalUrl?: string
    }
    const claimErrors = Array.isArray(parsed.claimErrors) ? parsed.claimErrors : []
    const anonymousClaimSkipped = claimErrors.some((err) =>
      /anonymous claim skipped/i.test(err),
    )
    return {
      ok: parsed.ok === true,
      errors: Array.isArray(parsed.errors) ? parsed.errors : ["sandbox produced no errors list"],
      claimOk: parsed.claimOk === true,
      claimErrors,
      anonymousClaimSkipped: anonymousClaimSkipped || undefined,
      finalUrl: parsed.finalUrl,
    }
  } catch {
    return { ok: false, errors: ["sandbox stdout was not JSON"], claimOk: false, claimErrors: [] }
  }
}

/** Headless microVM: upload check receipt, assert PNG + JSON, kill. Login stays on the browser profile. */
export async function verifyReceipt(
  runDir?: string,
  deps: VerifyDeps = defaultVerifyDeps(),
  opts?: { profileId?: string },
): Promise<VerifyResult> {
  const onProgress = deps.onProgress ?? noopProgress
  const overallMs = deps.overallMs ?? VERIFY_OVERALL_MS
  const dir = assertRunDirUnderRuns(runDir ? runDir : await findLatestRun())
  const { manifest, png } = await loadRunFiles(dir)
  assertReceiptUploadSize(manifest, png)
  const parsedManifest = JSON.parse(manifest) as { finalUrl?: string; expect?: string; profileSeed?: { cookies?: number } }
  let sandbox: SandboxHandle | undefined
  const createP = deps.create()
  try {
    return await raceWithTimeout(
      async (isCancelled, signal) => {
        onProgress("sandbox-create")
        try {
          sandbox = await observeAbort(createP, signal)
        } catch (err) {
          void createP.then((s) => s.kill().catch(() => undefined))
          throw err
        }
        if (isCancelled()) {
          await sandbox.kill().catch(() => undefined)
          throw new Error(`sandbox verify timed out after ${overallMs}ms`)
        }
        if (sandbox.sandboxId) await rememberLive("sandbox", sandbox.sandboxId).catch(() => undefined)
        onProgress("sandbox-upload")
        await sandbox.connect()
        await sandbox.files.mkdir("/work")
        await Promise.all([
          sandbox.files.write("/work/manifest.json", manifest),
          sandbox.files.write("/work/screenshot.png", png),
          sandbox.files.write("/work/assert.py", RECEIPT_ASSERT_PY),
        ])
        onProgress("sandbox-assert")
        const assertArgs = ["/work/assert.py", "/work"]
        if (deps.skipAnonymousClaim) assertArgs.push("--skip-anonymous-claim")
        const out = await boundPromise(
          sandbox.commands.run("python3", { args: assertArgs }),
          SANDBOX_ASSERT_TIMEOUT_MS,
          `sandbox assert timed out after ${SANDBOX_ASSERT_TIMEOUT_MS}ms`,
        )
        const parsed = parseAssertStdout(out.stdout || out.stderr || "")
        if (out.exitCode !== 0 && parsed.ok) {
          parsed.ok = false
          parsed.errors = [...parsed.errors, `python exit ${out.exitCode}`]
        }
        let result: VerifyResult = { ...parsed, runDir: dir, sandboxId: sandbox.sandboxId }
        onProgress("sandbox-kill")
        try {
          const killedId = sandbox.sandboxId
          await sandbox.kill()
          if (killedId) await forgetLive("sandbox", killedId).catch(() => undefined)
          sandbox = undefined
        } catch (killErr) {
          const msg = `sandbox kill failed: ${explainSolariError(killErr)}`
          return { ...result, ok: false, errors: [...result.errors, msg] }
        }
        
        if (opts?.profileId && deps.profileClaimCheck && parsedManifest.finalUrl && parsedManifest.expect) {
          onProgress("profile-claim-check")
          try {
            const profileClaim = await deps.profileClaimCheck({
              finalUrl: parsedManifest.finalUrl,
              expect: parsedManifest.expect,
              profileId: opts.profileId,
            })
            result = {
              ...result,
              claimOkProfile: profileClaim.claimOk,
              claimErrorsProfile: profileClaim.claimErrors,
              claimProfileSessionId: profileClaim.sessionId,
            }
          } catch (profileErr) {
            result = {
              ...result,
              claimOkProfile: false,
              claimErrorsProfile: [`profile claim check threw: ${explainSolariError(profileErr)}`],
            }
          }
        }
        
        return result
      },
      overallMs,
      `sandbox verify timed out after ${overallMs}ms`,
    )
  } catch (err) {
    if (sandbox) {
      try {
        const killedId = sandbox.sandboxId
        await sandbox.kill()
        if (killedId) await forgetLive("sandbox", killedId).catch(() => undefined)
      } catch {
        /* original error wins */
      }
    }
    throw new AuspexError(explainSolariError(err), {
      issue: classifySolariError(err),
      cause: err,
    })
  }
}

export type CheckThenVerifyDeps = {
  create?: () => Promise<SandboxHandle>
  check?: (opts: CheckOptions) => Promise<CheckResult>
  verify?: (runDir: string, profileId?: string) => Promise<VerifyResult>
  onProgress?: ProgressFn
  verifyWithProfile?: boolean
}

export async function checkThenVerify(
  opts: CheckOptions,
  deps?: CheckThenVerifyDeps,
): Promise<{ check: CheckResult; verify: VerifyResult }> {
  const onProgress = deps?.onProgress ?? opts.onProgress ?? noopProgress
  onProgress("check")
  const check = deps?.check ? await deps.check({ ...opts, onProgress }) : await runCheck({ ...opts, onProgress })
  const dir = runDirFromResult(check)
  if (!shouldVerifyAfterCheck(check.reason)) {
    return {
      check,
      verify: {
        ok: false,
        errors: [],
        claimOk: false,
        claimErrors: [],
        runDir: dir,
        skipped: true,
        skipReason: check.reason,
      },
    }
  }
  try {
    const verifyWithProfile = deps?.verifyWithProfile ?? opts.verifyWithProfile
    let profileId: string | undefined
    if (verifyWithProfile && opts.profile) {
      if (!deps?.verify) {
        const solari = createClient()
        profileId = await resolveProfileId(solari, opts.profile)
      } else {
        profileId = opts.profile
      }
    }
    const verify = deps?.verify
      ? await deps.verify(dir, profileId)
      : await verifyReceipt(dir, {
          ...defaultVerifyDeps(),
          skipAnonymousClaim: verifyWithProfile && Boolean(profileId),
        }, profileId ? { profileId } : undefined)
    return { check, verify }
  } catch (err) {
    return {
      check,
      verify: {
        ok: false,
        errors: [explainSolariError(err)],
        claimOk: false,
        claimErrors: [],
        runDir: dir,
      },
    }
  }
}

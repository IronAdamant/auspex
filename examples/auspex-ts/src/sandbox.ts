import { SolariClient } from "@solarisdk/sdk"
import { runCheck, runDirFromResult, type CheckOptions, type CheckResult } from "./check.ts"
import { MAX_IMAGE_BYTES } from "./content.ts"
import { AuspexError, classifySolariError, explainSolariError } from "./errors.ts"
import { noopProgress, type ProgressFn } from "./progress.ts"
import { assertRunDirUnderRuns, findLatestRun, loadRunFiles, RECEIPT_ASSERT_PY } from "./receipt.ts"
import { fetchWithIdempotencyKey, OVERALL_TIMEOUT_MS, requireApiKey } from "./solari.ts"
import { boundPromise, CLOSE_TIMEOUT_MS, observeAbort, raceWithTimeout } from "./timeout.ts"

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
  finalUrl?: string
  runDir: string
  sandboxId?: string
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
      finalUrl?: string
    }
    return {
      ok: parsed.ok === true,
      errors: Array.isArray(parsed.errors) ? parsed.errors : ["sandbox produced no errors list"],
      claimOk: parsed.claimOk === true,
      claimErrors: Array.isArray(parsed.claimErrors) ? parsed.claimErrors : [],
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
): Promise<VerifyResult> {
  const onProgress = deps.onProgress ?? noopProgress
  const overallMs = deps.overallMs ?? VERIFY_OVERALL_MS
  const dir = assertRunDirUnderRuns(runDir ? runDir : await findLatestRun())
  const { manifest, png } = await loadRunFiles(dir)
  assertReceiptUploadSize(manifest, png)
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
        onProgress("sandbox-upload")
        await sandbox.connect()
        await sandbox.files.mkdir("/work")
        await Promise.all([
          sandbox.files.write("/work/manifest.json", manifest),
          sandbox.files.write("/work/screenshot.png", png),
          sandbox.files.write("/work/assert.py", RECEIPT_ASSERT_PY),
        ])
        onProgress("sandbox-assert")
        const out = await boundPromise(
          sandbox.commands.run("python3", { args: ["/work/assert.py", "/work"] }),
          SANDBOX_ASSERT_TIMEOUT_MS,
          `sandbox assert timed out after ${SANDBOX_ASSERT_TIMEOUT_MS}ms`,
        )
        const parsed = parseAssertStdout(out.stdout || out.stderr || "")
        if (out.exitCode !== 0 && parsed.ok) {
          parsed.ok = false
          parsed.errors = [...parsed.errors, `python exit ${out.exitCode}`]
        }
        const result: VerifyResult = { ...parsed, runDir: dir, sandboxId: sandbox.sandboxId }
        onProgress("sandbox-kill")
        try {
          await sandbox.kill()
          sandbox = undefined
        } catch (killErr) {
          const msg = `sandbox kill failed: ${explainSolariError(killErr)}`
          return { ...result, ok: false, errors: [...result.errors, msg] }
        }
        return result
      },
      overallMs,
      `sandbox verify timed out after ${overallMs}ms`,
    )
  } catch (err) {
    if (sandbox) {
      try {
        await sandbox.kill()
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
  verify?: (runDir: string) => Promise<VerifyResult>
  onProgress?: ProgressFn
}

export async function checkThenVerify(
  opts: CheckOptions,
  deps?: CheckThenVerifyDeps,
): Promise<{ check: CheckResult; verify: VerifyResult }> {
  const onProgress = deps?.onProgress ?? opts.onProgress ?? noopProgress
  const overlap = !deps?.verify
  const createFn = overlap ? (deps?.create ?? defaultVerifyDeps().create) : undefined
  let created: SandboxHandle | undefined
  const pending = createFn
    ? createFn().then((s) => {
        created = s
        return s
      })
    : undefined
  try {
    onProgress("check")
    const check = deps?.check ? await deps.check({ ...opts, onProgress }) : await runCheck({ ...opts, onProgress })
    const dir = runDirFromResult(check)
    try {
      const verify = deps?.verify
        ? await deps.verify(dir)
        : await verifyReceipt(dir, {
            create: async () => {
              if (pending) return pending
              return (deps?.create ?? defaultVerifyDeps().create)()
            },
            onProgress,
          })
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
  } catch (err) {
    if (pending) {
      try {
        const s = created ?? (await pending.catch(() => undefined))
        if (s) await s.kill()
      } catch {
        /* check error wins */
      }
    }
    throw err
  }
}

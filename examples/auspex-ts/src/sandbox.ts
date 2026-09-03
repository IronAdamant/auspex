import { SolariClient } from "@solarisdk/sdk"
import { runCheck, runDirFromResult, type CheckOptions, type CheckResult } from "./check.ts"
import { MAX_IMAGE_BYTES } from "./content.ts"
import { explainSolariError } from "./errors.ts"
import { assertRunDirUnderRuns, findLatestRun, loadRunFiles, RECEIPT_ASSERT_PY } from "./receipt.ts"
import { OVERALL_TIMEOUT_MS, requireApiKey } from "./solari.ts"
import { boundPromise, CLOSE_TIMEOUT_MS } from "./timeout.ts"

export const SANDBOX_ASSERT_TIMEOUT_MS = 60_000
/** Nested check + session-close + sandbox-assert budgets. Must stay ≤ Auspex MCP tool_timeout_sec. */
export const CHECK_THEN_VERIFY_WORST_MS =
  OVERALL_TIMEOUT_MS + CLOSE_TIMEOUT_MS + SANDBOX_ASSERT_TIMEOUT_MS

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
}

export function defaultVerifyDeps(): VerifyDeps {
  return {
    create: async () => {
      const pt = new SolariClient({ apiKey: requireApiKey() })
      return pt.sandboxes.create({
        template: "base",
        timeoutMs: 5 * 60_000,
        lifecycle: { onTimeout: "kill" },
      })
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
  const dir = assertRunDirUnderRuns(runDir ? runDir : await findLatestRun())
  const { manifest, png } = await loadRunFiles(dir)
  assertReceiptUploadSize(manifest, png)
  const sandbox = await deps.create()
  try {
    await sandbox.connect()
    await sandbox.files.mkdir("/work")
    await sandbox.files.write("/work/manifest.json", manifest)
    await sandbox.files.write("/work/screenshot.png", png)
    await sandbox.files.write("/work/assert.py", RECEIPT_ASSERT_PY)
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
    try {
      await sandbox.kill()
    } catch (killErr) {
      const msg = `sandbox kill failed: ${explainSolariError(killErr)}`
      return { ...result, ok: false, errors: [...result.errors, msg] }
    }
    return result
  } catch (err) {
    try {
      await sandbox.kill()
    } catch {
      /* original error wins */
    }
    throw new Error(explainSolariError(err))
  }
}

export type CheckThenVerifyDeps = {
  create?: () => Promise<SandboxHandle>
  check?: (opts: CheckOptions) => Promise<CheckResult>
  verify?: (runDir: string) => Promise<VerifyResult>
}

export async function checkThenVerify(
  opts: CheckOptions,
  deps?: CheckThenVerifyDeps,
): Promise<{ check: CheckResult; verify: VerifyResult }> {
  const check = deps?.check ? await deps.check(opts) : await runCheck(opts)
  const dir = runDirFromResult(check)
  try {
    const verify = deps?.verify
      ? await deps.verify(dir)
      : await verifyReceipt(dir, deps?.create ? { create: deps.create } : undefined)
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

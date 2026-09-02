import { SolariClient } from "@solarisdk/sdk"
import { runCheck, runDirFromResult, type CheckOptions, type CheckResult } from "./check.ts"
import { MAX_IMAGE_BYTES } from "./content.ts"
import { explainSolariError } from "./errors.ts"
import { assertRunDirUnderRuns, findLatestRun, loadRunFiles, RECEIPT_ASSERT_PY } from "./receipt.ts"
import { requireApiKey } from "./solari.ts"
import { boundPromise } from "./timeout.ts"

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
      60_000,
      "sandbox assert timed out after 60000ms",
    )
    const parsed = parseAssertStdout(out.stdout || out.stderr || "")
    if (out.exitCode !== 0 && parsed.ok) {
      parsed.ok = false
      parsed.errors = [...parsed.errors, `python exit ${out.exitCode}`]
    }
    return { ...parsed, runDir: dir, sandboxId: sandbox.sandboxId }
  } catch (err) {
    throw new Error(explainSolariError(err))
  } finally {
    try {
      await sandbox.kill()
    } catch {
      /* original error wins */
    }
  }
}

export async function checkThenVerify(
  opts: CheckOptions,
  deps?: VerifyDeps,
): Promise<{ check: CheckResult; verify: VerifyResult }> {
  const check = await runCheck(opts)
  const verify = await verifyReceipt(runDirFromResult(check), deps)
  return { check, verify }
}

import { SolariClient } from "@solarisdk/sdk"
import { explainSolariError } from "./errors.ts"
import { findLatestRun, loadRunFiles, RECEIPT_ASSERT_PY } from "./receipt.ts"
import { requireApiKey } from "./solari.ts"

export type VerifyResult = {
  ok: boolean
  errors: string[]
  finalUrl?: string
  runDir: string
  sandboxId?: string
}

export function parseAssertStdout(stdout: string): { ok: boolean; errors: string[]; finalUrl?: string } {
  const line = stdout.trim().split("\n").filter(Boolean).at(-1) ?? ""
  if (!line) return { ok: false, errors: ["sandbox produced no stdout"] }
  try {
    const parsed = JSON.parse(line) as { ok?: boolean; errors?: string[]; finalUrl?: string }
    return {
      ok: parsed.ok === true,
      errors: Array.isArray(parsed.errors) ? parsed.errors : ["sandbox produced no errors list"],
      finalUrl: parsed.finalUrl,
    }
  } catch {
    return { ok: false, errors: ["sandbox stdout was not JSON"] }
  }
}

/** Headless microVM: upload check receipt, assert PNG + JSON, kill. Login stays on the browser profile. */
export async function verifyReceipt(runDir?: string): Promise<VerifyResult> {
  const dir = runDir ? runDir : await findLatestRun()
  const { manifest, png } = await loadRunFiles(dir)
  const pt = new SolariClient({ apiKey: requireApiKey() })
  const sandbox = await pt.sandboxes.create({
    template: "base",
    timeoutMs: 5 * 60_000,
    lifecycle: { onTimeout: "kill" },
  })
  try {
    await sandbox.connect()
    await sandbox.files.mkdir("/work")
    await sandbox.files.write("/work/manifest.json", manifest)
    await sandbox.files.write("/work/screenshot.png", png)
    await sandbox.files.write("/work/assert.py", RECEIPT_ASSERT_PY)
    const out = await sandbox.commands.run("python3", { args: ["/work/assert.py", "/work"] })
    const parsed = parseAssertStdout(out.stdout || out.stderr || "{}")
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

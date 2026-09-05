import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { MAX_IMAGE_BYTES } from "../src/content.ts"
import { parseArgv } from "../src/cli.ts"
import { assertRunDirUnderRuns, findLatestRun, RECEIPT_ASSERT_PY, RUNS_DIR } from "../src/receipt.ts"
import { encodePng } from "../src/png-fit.ts"
import { assertReceiptUploadSize, parseAssertStdout, verifyReceipt } from "../src/sandbox.ts"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const demoPng = path.join(root, "demo", "ironadamant.png")

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const CRC_TABLE = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  CRC_TABLE[n] = c >>> 0
}
function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, "ascii")
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crcBuf])
}
/** Valid IHDR + CRC, garbage IDAT that will not inflate to pixels. */
function forgedPngIhdr(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    PNG_SIG,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", Buffer.from("not-a-zlib-stream")),
    pngChunk("IEND", Buffer.alloc(0)),
  ])
}

function runAssert(work: string) {
  return spawnSync("python3", ["-c", RECEIPT_ASSERT_PY, work], { encoding: "utf8" })
}

test("RECEIPT_ASSERT_PY accepts a good public receipt", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "auspex-receipt-"))
  writeFileSync(
    path.join(dir, "manifest.json"),
    `${JSON.stringify({
      ok: true,
      matched: true,
      screenshotPath: ".auspex/runs/stamp/screenshot.png",
      finalUrl: "https://ironadamant.com/",
    })}\n`,
  )
  writeFileSync(path.join(dir, "screenshot.png"), readFileSync(demoPng))
  const out = runAssert(dir)
  assert.equal(out.status, 0, out.stderr + out.stdout)
  const parsed = JSON.parse(out.stdout) as {
    ok: boolean
    errors: string[]
    claimOk: boolean
    claimErrors: string[]
  }
  assert.equal(parsed.ok, true)
  assert.deepEqual(parsed.errors, [])
  assert.equal(parsed.claimOk, true)
  assert.deepEqual(parsed.claimErrors, [])
})

test("RECEIPT_ASSERT_PY separates claim miss from receipt junk", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "auspex-receipt-"))
  writeFileSync(
    path.join(dir, "manifest.json"),
    `${JSON.stringify({
      ok: false,
      matched: false,
      screenshotPath: ".auspex/runs/stamp/screenshot.png",
      finalUrl: "https://ironadamant.com/",
    })}\n`,
  )
  writeFileSync(path.join(dir, "screenshot.png"), readFileSync(demoPng))
  const out = runAssert(dir)
  assert.equal(out.status, 0, out.stderr + out.stdout)
  const parsed = JSON.parse(out.stdout) as {
    ok: boolean
    errors: string[]
    claimOk: boolean
    claimErrors: string[]
  }
  assert.equal(parsed.ok, true)
  assert.deepEqual(parsed.errors, [])
  assert.equal(parsed.claimOk, false)
  assert.ok(parsed.claimErrors.some((e) => /ok is not true/i.test(e)))
})

test("RECEIPT_ASSERT_PY fails a tiny PNG even when the manifest claims ok", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "auspex-receipt-"))
  writeFileSync(
    path.join(dir, "manifest.json"),
    `${JSON.stringify({
      ok: true,
      matched: true,
      screenshotPath: ".auspex/runs/stamp/screenshot.png",
      finalUrl: "https://ironadamant.com/",
    })}\n`,
  )
  writeFileSync(path.join(dir, "screenshot.png"), encodePng(1, 1, Buffer.from([0, 0, 0]), 3))
  const out = runAssert(dir)
  assert.notEqual(out.status, 0)
  const parsed = JSON.parse(out.stdout) as { ok: boolean; errors: string[] }
  assert.equal(parsed.ok, false)
  assert.ok(parsed.errors.some((e) => /tiny|small|empty/i.test(e)))
})

test("RECEIPT_ASSERT_PY fails a forged IHDR with garbage IDAT even when the manifest claims ok", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "auspex-receipt-"))
  writeFileSync(
    path.join(dir, "manifest.json"),
    `${JSON.stringify({
      ok: true,
      matched: true,
      screenshotPath: ".auspex/runs/stamp/screenshot.png",
      finalUrl: "https://ironadamant.com/",
    })}\n`,
  )
  writeFileSync(path.join(dir, "screenshot.png"), forgedPngIhdr(1920, 1080))
  const out = runAssert(dir)
  assert.notEqual(out.status, 0, out.stdout + out.stderr)
  const parsed = JSON.parse(out.stdout) as { ok: boolean; errors: string[] }
  assert.equal(parsed.ok, false)
  assert.ok(parsed.errors.some((e) => /invalid|IDAT|pixels|zlib|decompress/i.test(e)))
})

test("RECEIPT_ASSERT_PY fails leftover-auth URLs and non-PNGs", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "auspex-receipt-"))
  writeFileSync(
    path.join(dir, "manifest.json"),
    `${JSON.stringify({
      ok: true,
      matched: true,
      screenshotPath: ".auspex/runs/stamp/screenshot.png",
      finalUrl: "https://consistencyhub.io/login",
    })}\n`,
  )
  writeFileSync(path.join(dir, "screenshot.png"), Buffer.from("not a png"))
  const out = runAssert(dir)
  assert.notEqual(out.status, 0)
  const parsed = JSON.parse(out.stdout) as { ok: boolean; errors: string[]; claimOk: boolean }
  assert.equal(parsed.ok, false)
  assert.ok(parsed.errors.some((e) => /PNG/i.test(e)))
  assert.ok(parsed.errors.some((e) => /auth path/i.test(e)))
})

test("assertRunDirUnderRuns rejects paths outside .auspex/runs", () => {
  assert.throws(() => assertRunDirUnderRuns("/etc/passwd"), /under \.auspex\/runs/)
  const ok = assertRunDirUnderRuns(path.join(RUNS_DIR, "stamp"))
  assert.ok(ok.includes(".auspex"))
})

test("findLatestRun picks the complete newest stamp", async () => {
  const runs = mkdtempSync(path.join(tmpdir(), "auspex-runs-"))
  mkdirSync(path.join(runs, "older"))
  writeFileSync(path.join(runs, "older", "manifest.json"), "{}")
  const newest = path.join(runs, "zzzz-new")
  mkdirSync(newest)
  writeFileSync(path.join(newest, "manifest.json"), "{}")
  writeFileSync(path.join(newest, "screenshot.png"), Buffer.alloc(8))
  const found = await findLatestRun(runs)
  assert.equal(found, newest)
})

test("parseAssertStdout uses the last JSON line and rejects garbage", () => {
  const ok = parseAssertStdout('noise\n{"ok":true,"errors":[],"claimOk":true,"claimErrors":[]}\n')
  assert.equal(ok.ok, true)
  assert.deepEqual(ok.errors, [])
  assert.equal(ok.claimOk, true)
  const bad = parseAssertStdout("not json")
  assert.equal(bad.ok, false)
  assert.match(bad.errors[0] ?? "", /not JSON/)
  const empty = parseAssertStdout("   ")
  assert.equal(empty.ok, false)
})

test("RECEIPT_ASSERT_PY does not treat a suffix host as Microsoft", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "auspex-receipt-"))
  writeFileSync(
    path.join(dir, "manifest.json"),
    `${JSON.stringify({
      ok: true,
      matched: true,
      screenshotPath: ".auspex/runs/stamp/screenshot.png",
      finalUrl: "https://login.microsoftonline.com.evil.com/",
    })}\n`,
  )
  writeFileSync(path.join(dir, "screenshot.png"), readFileSync(demoPng))
  const out = runAssert(dir)
  assert.equal(out.status, 0, out.stderr + out.stdout)
})

test("runCheck source does not auto-save Solari profiles", () => {
  const src = readFileSync(path.join(root, "src", "check.ts"), "utf8")
  assert.equal(src.includes("profiles.save"), false)
  assert.equal(src.includes(".save("), false)
})

test("assertReceiptUploadSize rejects oversized PNG+JSON", () => {
  const png = Buffer.alloc(MAX_IMAGE_BYTES + 1)
  assert.throws(() => assertReceiptUploadSize("{}", png), /exceeds/)
})

test("verifyReceipt does not write when the receipt is oversized", async () => {
  const dir = path.join(RUNS_DIR, `cap-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, "manifest.json"), "{}\n")
  writeFileSync(path.join(dir, "screenshot.png"), Buffer.alloc(MAX_IMAGE_BYTES + 8))
  let created = false
  await assert.rejects(
    () =>
      verifyReceipt(dir, {
        create: async () => {
          created = true
          throw new Error("should not create")
        },
      }),
    /exceeds/,
  )
  assert.equal(created, false)
})

test("verifyReceipt writes RECEIPT_ASSERT_PY and kills even if run throws", async () => {
  const dir = path.join(RUNS_DIR, `inj-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    path.join(dir, "manifest.json"),
    `${JSON.stringify({
      ok: true,
      matched: true,
      screenshotPath: ".auspex/runs/stamp/screenshot.png",
      finalUrl: "https://ironadamant.com/",
    })}\n`,
  )
  writeFileSync(path.join(dir, "screenshot.png"), readFileSync(demoPng))
  let script = ""
  let ran: { cmd: string; args: string[] } | undefined
  let killed = false
  await assert.rejects(
    () =>
      verifyReceipt(dir, {
        create: async () => ({
          connect: async () => undefined,
          files: {
            mkdir: async () => undefined,
            write: async (p, data) => {
              if (p.endsWith("assert.py")) script = String(data)
            },
          },
          commands: {
            run: async (cmd, opts) => {
              ran = { cmd, args: opts.args }
              throw new Error("boom")
            },
          },
          kill: async () => {
            killed = true
          },
        }),
      }),
    /boom/,
  )
  assert.equal(script, RECEIPT_ASSERT_PY)
  assert.equal(ran?.cmd, "python3")
  assert.ok(ran?.args.some((a) => a.includes("assert.py")))
  assert.equal(killed, true)
})

test("parseArgv check --verify requests verify-after-check", () => {
  const parsed = parseArgv([
    "check",
    "https://ironadamant.com",
    "--expect",
    "Build it.",
    "--verify",
  ])
  assert.equal(parsed.status, "ok")
  if (parsed.status === "ok" && parsed.command.cmd === "check") {
    assert.equal(parsed.command.verifyAfter, true)
  }
})

test("verifyReceipt is not ok:true when kill fails after a good assert", async () => {
  const dir = path.join(RUNS_DIR, `killok-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    path.join(dir, "manifest.json"),
    `${JSON.stringify({
      ok: true,
      matched: true,
      screenshotPath: ".auspex/runs/stamp/screenshot.png",
      finalUrl: "https://ironadamant.com/",
    })}\n`,
  )
  writeFileSync(path.join(dir, "screenshot.png"), readFileSync(demoPng))
  const result = await verifyReceipt(dir, {
    create: async () => ({
      connect: async () => undefined,
      files: {
        mkdir: async () => undefined,
        write: async () => undefined,
      },
      commands: {
        run: async () => ({
          exitCode: 0,
          stdout: `${JSON.stringify({ ok: true, errors: [], claimOk: true, claimErrors: [] })}\n`,
        }),
      },
      kill: async () => {
        throw new Error("kill boom")
      },
      sandboxId: "sbx-1",
    }),
  })
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((e) => /kill/i.test(e)))
  assert.match(result.errors.join(" "), /kill boom/)
})

test("checkThenVerify keeps the check receipt when verify throws", async () => {
  const { checkThenVerify } = await import("../src/sandbox.ts")
  const check = {
    title: "Software & AI tooling | Iron Adamant",
    finalUrl: "https://ironadamant.com/",
    ok: true,
    expect: "Build it.",
    matched: true,
    excerpt: "Build it.",
    screenshotPath: ".auspex/runs/stamp/screenshot.png",
    sessionId: "sess-paid",
    networkIdle: true,
  }
  const both = await checkThenVerify(
    { url: "https://ironadamant.com", expect: "Build it." },
    {
      check: async () => check,
      verify: async () => {
        throw new Error("sandbox down")
      },
    },
  )
  assert.equal(both.check.screenshotPath, check.screenshotPath)
  assert.equal(both.check.sessionId, "sess-paid")
  assert.equal(both.check.ok, true)
  assert.equal(both.verify.ok, false)
  assert.match(both.verify.errors.join(" "), /sandbox down/)
})

test("verifyReceipt overall bound kills a hung create", async () => {
  const dir = path.join(RUNS_DIR, `bound-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    path.join(dir, "manifest.json"),
    `${JSON.stringify({
      ok: true,
      matched: true,
      screenshotPath: ".auspex/runs/stamp/screenshot.png",
      finalUrl: "https://ironadamant.com/",
    })}\n`,
  )
  writeFileSync(path.join(dir, "screenshot.png"), readFileSync(demoPng))
  let killed = false
  await assert.rejects(
    () =>
      verifyReceipt(dir, {
        overallMs: 40,
        create: async () => {
          await new Promise((r) => setTimeout(r, 200))
          return {
            connect: async () => undefined,
            files: { mkdir: async () => undefined, write: async () => undefined },
            commands: { run: async () => ({ exitCode: 0, stdout: "{}" }) },
            kill: async () => {
              killed = true
            },
          }
        },
      }),
    /timed out/,
  )
  await new Promise((r) => setTimeout(r, 250))
  assert.equal(killed, true)
})

test("parseArgv verify accepts an optional run dir", () => {
  const a = parseArgv(["verify"])
  assert.equal(a.status, "ok")
  if (a.status === "ok" && a.command.cmd === "verify") assert.equal(a.command.runDir, undefined)
  const b = parseArgv(["verify", ".auspex/runs/stamp"])
  assert.equal(b.status, "ok")
  if (b.status === "ok" && b.command.cmd === "verify") {
    assert.equal(b.command.runDir, ".auspex/runs/stamp")
  }
})

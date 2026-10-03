// Slim B drop rule: a synchronous test that neither starts a process nor touches files, directly
// or through a helper defined in its file, outside the security, real-data and contract files.
const fs = require("fs"), cp = require("child_process")
const keepFiles = new Set(["security-guards.test.ts","receipt-schema.test.ts","demo.test.ts","assert-receipt-origin.test.ts","agents-sync.test.ts","door-await-contract.test.ts","door-cache.test.ts","live-smoke.test.ts","dist.test.ts","mcp-boot.test.ts","any-host.test.ts"])
const IO = /spawnSync|execFileSync|execSync|spawn\(|mkdtempSync|writeFileSync|readFileSync|tmpdir\(\)|runInNewContext|createContext|new Script/
const out = []
const files = cp.execSync("git ls-tree --name-only b5ef60d tests/").toString().split("\n").filter(f => /^tests\/[\w-]+\.test\.ts$/.test(f)).map(f => f.slice(6))
for (const f of [...new Set(files)]) {
  if (keepFiles.has(f)) continue
  const lines = cp.execSync(`git show b5ef60d:examples/auspex-ts/tests/${f}`).toString().split("\n")
  // helpers in this file that do IO (one level, then fixpoint over helpers calling helpers)
  const helpers = {}
  lines.forEach((l, i) => {
    const m = l.match(/^(?:async )?function (\w+)|^const (\w+) = (?:async )?\(/)
    if (!m) return
    let e = i + 1; while (e < lines.length && !/^\}/.test(lines[e])) e++
    helpers[m[1] || m[2]] = lines.slice(i, e + 1).join("\n")
  })
  const ioHelpers = new Set(Object.keys(helpers).filter(h => IO.test(helpers[h])))
  for (let changed = true; changed;) { changed = false; for (const [h, b] of Object.entries(helpers)) if (!ioHelpers.has(h) && [...ioHelpers].some(x => new RegExp(`\\b${x}\\(`).test(b))) { ioHelpers.add(h); changed = true } }
  lines.forEach((l, s) => {
    if (!/^(test|it)\((["`]).*?\2, \(\) =>/.test(l)) return
    let e = s + 1; while (e < lines.length && !/^\}\)/.test(lines[e])) e++
    const body = lines.slice(s, e + 1).join("\n")
    if (IO.test(body) || [...ioHelpers].some(h => new RegExp(`\\b${h}\\(`).test(body))) return
    out.push(f + "\t" + l.match(/^(?:test|it)\((["`])(.*?)\1/)[2])
  })
}
// Slim A already removed some of these titles; only keep titles that still exist after A.
const afterA = new Set()
for (const f of files)
  for (const l of cp.execSync(`git show b5ef60d:examples/auspex-ts/tests/${f}`).toString().split("\n")) { const m = l.match(/^(?:test|it)\((["`])(.*?)\1/); if (m) afterA.add(f + "\t" + m[2]) }
const final = out.filter(r => afterA.has(r))
fs.writeFileSync(process.argv[2], final.join("\n") + "\n")
const old = new Set(fs.readFileSync(process.argv[3], "utf8").trim().split("\n"))
console.log("new list", final.length, "old list", old.size)
console.log("no longer dropped:"); for (const r of old) if (!final.includes(r)) console.log("  " + r)
console.log("newly dropped:"); for (const r of final) if (!old.has(r)) console.log("  " + r)

// Usage: node analyze.mjs <resultsRoot> <variant>...   (resultsRoot holds results-<variant>/)
// Prints, for each mutant, whether each variant's suite caught it and which tests failed.
import { existsSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"

const [root, ...variants] = process.argv.slice(2)

function failures(tap) {
  const out = []
  for (const line of readFileSync(tap, "utf8").split("\n")) {
    const m = line.match(/^(\s*)not ok \d+ - (.*)$/)
    if (!m) continue
    const title = m[2].replace(/ # .*$/, "")
    if (title.endsWith(".test.ts")) continue // file-level row; its tests are listed separately
    out.push(title)
  }
  return out
}

const mutants = new Set()
const data = {}
for (const v of variants) {
  const dir = path.join(root, `results-${v}`)
  data[v] = {}
  for (const group of ["mutants", "fuzzy", "hand"]) {
    const g = path.join(dir, group)
    if (!existsSync(g)) continue
    for (const f of readdirSync(g).filter((f) => f.endsWith(".tap"))) {
      const id = `${group}/${f.replace(/\.tap$/, "")}`
      mutants.add(id)
      data[v][id] = failures(path.join(g, f))
    }
  }
}

const rows = [...mutants].sort()
const caught = Object.fromEntries(variants.map((v) => [v, 0]))
console.log(["mutant", ...variants].join("\t"))
for (const id of rows) {
  const cells = variants.map((v) => {
    const f = data[v][id]
    if (!f) return "-"
    if (f.length) caught[v]++
    return f.length ? `caught(${f.length})` : "MISSED"
  })
  console.log([id, ...cells].join("\t"))
}
console.log(["total caught", ...variants.map((v) => `${caught[v]}/${Object.keys(data[v]).length}`)].join("\t"))
if (process.env.DETAIL) {
  for (const id of rows) {
    console.log(`\n## ${id}`)
    for (const v of variants) console.log(`  ${v}: ${(data[v][id] ?? ["(not run)"]).join(" | ") || "(none)"}`)
  }
}

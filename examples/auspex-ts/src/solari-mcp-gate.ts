import { existsSync, readFileSync } from "node:fs"
import { DOTENV_PATH } from "./solari.ts"

/** True when a non-empty SOLARI_API_KEY is in env or the gitignored .env. */
export function solariKeyReady(
  env: NodeJS.ProcessEnv = process.env,
  dotenvFile = env.AUSPEX_DOTENV_PATH || DOTENV_PATH,
): boolean {
  if (env.SOLARI_API_KEY?.trim()) return true
  if (!dotenvFile || !existsSync(dotenvFile)) return false
  for (const raw of readFileSync(dotenvFile, "utf8").split("\n")) {
    let line = raw
    if (line.charCodeAt(0) === 0xfeff) line = line.slice(1)
    line = line.trim()
    if (!line || line.startsWith("#")) continue
    if (line.startsWith("export ")) line = line.slice(7).trim()
    const cut = line.indexOf("=")
    if (cut <= 0) continue
    const name = line.slice(0, cut).trim()
    let value = line.slice(cut + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (name === "SOLARI_API_KEY" && value) return true
  }
  return false
}

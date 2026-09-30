import { DOTENV_PATH, readSolariKeyFromFile } from "./solari.ts"

/** True when a non-empty SOLARI_API_KEY is in env or the gitignored .env. */
export function solariKeyReady(
  env: NodeJS.ProcessEnv = process.env,
  dotenvFile = env.AUSPEX_DOTENV_PATH || DOTENV_PATH,
): boolean {
  if (env.SOLARI_API_KEY?.trim()) return true
  return Boolean(dotenvFile && readSolariKeyFromFile(dotenvFile))
}

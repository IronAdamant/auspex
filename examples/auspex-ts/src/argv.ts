/** Flag reading shared by every CLI command, so a value is read the same way everywhere. */

/** `--flag` or `-x` is the next option, not a value. `-20% off` and `-1` are values. */
export function looksLikeFlag(value: string): boolean {
  return /^--/.test(value) || /^-[A-Za-z]/.test(value)
}

/** Removes `name` from args and says whether it was there. */
export function takeFlag(args: string[], name: string): boolean {
  const i = args.indexOf(name)
  if (i === -1) return false
  args.splice(i, 1)
  return true
}

/**
 * Removes `name <value>` from args and returns the value. A missing value (or a flag in its place)
 * leaves both in args, so the caller reports them as unexpected. `rejectHttp` does the same for a URL.
 */
export function takeOption(args: string[], name: string, opts: { rejectHttp?: boolean } = {}): string | undefined {
  const i = args.indexOf(name)
  if (i === -1) return undefined
  const value = args[i + 1]
  if (value === undefined || looksLikeFlag(value)) return undefined
  if (opts.rejectHttp && /^https?:\/\//i.test(value)) return undefined
  args.splice(i, 2)
  return value
}

/** Anything left after the flags were taken is a usage error. */
export function unexpectedArgs(args: readonly string[]): string | undefined {
  return args.length > 0 ? `unexpected arguments: ${args.join(" ")}` : undefined
}

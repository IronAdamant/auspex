import { deflateSync, inflateSync } from "node:zlib"

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

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

function chunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, "ascii")
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

export type DecodedPng = {
  width: number
  height: number
  bpp: 3 | 4
  pixels: Buffer
}

function unfilter(data: Buffer, width: number, height: number, bpp: number): Buffer {
  const stride = width * bpp
  const out = Buffer.alloc(height * stride)
  let src = 0
  for (let y = 0; y < height; y++) {
    if (src >= data.length) throw new Error("PNG IDAT truncated")
    const filter = data[src++]!
    const row = out.subarray(y * stride, (y + 1) * stride)
    const prev = y === 0 ? undefined : out.subarray((y - 1) * stride, y * stride)
    for (let i = 0; i < stride; i++) {
      if (src >= data.length) throw new Error("PNG IDAT truncated")
      const raw = data[src++]!
      const a = i >= bpp ? row[i - bpp]! : 0
      const b = prev ? prev[i]! : 0
      const c = prev && i >= bpp ? prev[i - bpp]! : 0
      let val: number
      switch (filter) {
        case 0:
          val = raw
          break
        case 1:
          val = (raw + a) & 255
          break
        case 2:
          val = (raw + b) & 255
          break
        case 3:
          val = (raw + ((a + b) >> 1)) & 255
          break
        case 4:
          val = (raw + paeth(a, b, c)) & 255
          break
        default:
          throw new Error(`unsupported PNG filter ${filter}`)
      }
      row[i] = val
    }
  }
  return out
}

export function decodePng(buf: Buffer): DecodedPng {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIG)) {
    throw new Error("not a PNG")
  }
  let i = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  const idats: Buffer[] = []
  while (i + 12 <= buf.length) {
    const len = buf.readUInt32BE(i)
    const type = buf.subarray(i + 4, i + 8).toString("ascii")
    const data = buf.subarray(i + 8, i + 8 + len)
    i += 12 + len
    if (type === "IHDR") {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]!
      colorType = data[9]!
      const interlace = data[12]!
      if (bitDepth !== 8) throw new Error("PNG bit depth must be 8")
      if (interlace !== 0) throw new Error("interlaced PNG is not supported")
      if (colorType !== 2 && colorType !== 6) throw new Error("PNG color type must be RGB or RGBA")
    } else if (type === "IDAT") {
      idats.push(Buffer.from(data))
    } else if (type === "IEND") {
      break
    }
  }
  if (!width || !height) throw new Error("PNG missing IHDR")
  const bpp = colorType === 6 ? 4 : 3
  const inflated = inflateSync(Buffer.concat(idats))
  const pixels = unfilter(inflated, width, height, bpp)
  return { width, height, bpp, pixels }
}

export function encodePng(width: number, height: number, pixels: Buffer, bpp: 3 | 4): Buffer {
  const stride = width * bpp
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = bpp === 4 ? 6 : 2
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  return Buffer.concat([
    PNG_SIG,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

function resize(
  pixels: Buffer,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
  bpp: number,
): Buffer {
  const out = Buffer.alloc(dw * dh * bpp)
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(sh - 1, Math.floor(((y + 0.5) * sh) / dh))
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(sw - 1, Math.floor(((x + 0.5) * sw) / dw))
      const si = (sy * sw + sx) * bpp
      pixels.copy(out, (y * dw + x) * bpp, si, si + bpp)
    }
  }
  return out
}

/** Return `png` if already ≤ cap; otherwise a downscaled PNG that fits. Does not mutate the input. */
export function fitPngUnderCap(png: Buffer, cap: number): Buffer {
  if (png.length <= cap) return png
  const decoded = decodePng(png)
  let scale = Math.min(1, Math.sqrt(cap / png.length) * 0.9)
  for (let i = 0; i < 12; i++) {
    const dw = Math.max(1, Math.floor(decoded.width * scale))
    const dh = Math.max(1, Math.floor(decoded.height * scale))
    const pixels = resize(decoded.pixels, decoded.width, decoded.height, dw, dh, decoded.bpp)
    const out = encodePng(dw, dh, pixels, decoded.bpp)
    if (out.length <= cap) return out
    scale *= 0.7
  }
  const pixels = resize(decoded.pixels, decoded.width, decoded.height, 1, 1, decoded.bpp)
  const tiny = encodePng(1, 1, pixels, decoded.bpp)
  if (tiny.length > cap) throw new Error("PNG could not be scaled under cap")
  return tiny
}

export const MCP_ATTACH_MAX_SIDE = 1024
export const MCP_ATTACH_MAX_BYTES = 180 * 1024

/** Smaller MCP attach: a real downscaled PNG. Does not mutate the on-disk full-page shot. */
export function fitMcpAttach(png: Buffer, cap = MCP_ATTACH_MAX_BYTES): { buf: Buffer; mimeType: "image/png" } {
  const decoded = decodePng(png)
  const scale = Math.min(0.9, MCP_ATTACH_MAX_SIDE / Math.max(decoded.width, decoded.height, 1))
  const dw = Math.max(1, Math.floor(decoded.width * scale))
  const dh = Math.max(1, Math.floor(decoded.height * scale))
  const pixels = resize(decoded.pixels, decoded.width, decoded.height, dw, dh, decoded.bpp)
  const pngOut = fitPngUnderCap(encodePng(dw, dh, pixels, decoded.bpp), cap)
  decodePng(pngOut)
  return { buf: pngOut, mimeType: "image/png" }
}

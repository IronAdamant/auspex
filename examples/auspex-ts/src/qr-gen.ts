import QRCode from "qrcode"
import path from "node:path"

export type QRResult = {
  qrPath: string
}

export async function generateQRCode(url: string, runDir: string): Promise<QRResult> {
  const qrPath = path.join(runDir, "handoff-qr.png")
  try {
    await QRCode.toFile(qrPath, url, {
      errorCorrectionLevel: "M",
      type: "png",
      width: 400,
      margin: 2,
    })
    return { qrPath }
  } catch {
    return { qrPath: "" }
  }
}

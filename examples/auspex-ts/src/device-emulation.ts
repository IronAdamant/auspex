import type { BrowserContextOptions } from "patchright-core"

export type DeviceDescriptor = {
  viewport: {
    width: number
    height: number
  }
  userAgent: string
  deviceScaleFactor?: number
  isMobile: boolean
  hasTouch?: boolean
}

export const DEVICES: Record<string, DeviceDescriptor> = {
  "iphone-12": {
    viewport: { width: 390, height: 844 },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1",
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
  "iphone-13-pro": {
    viewport: { width: 390, height: 844 },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
  "pixel-5": {
    viewport: { width: 393, height: 851 },
    userAgent: "Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile Safari/537.36",
    deviceScaleFactor: 2.75,
    isMobile: true,
    hasTouch: true,
  },
  "galaxy-s21": {
    viewport: { width: 360, height: 800 },
    userAgent: "Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile Safari/537.36",
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
  "ipad-pro": {
    viewport: { width: 1024, height: 1366 },
    userAgent: "Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1",
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
}

export type MobileDeviceOptions = {
  device?: string
  mobile?: boolean
}

export function parseDeviceOptions(opts: MobileDeviceOptions): Partial<BrowserContextOptions> | undefined {
  if (opts.device) {
    const device = DEVICES[opts.device.toLowerCase()]
    if (!device) {
      const available = Object.keys(DEVICES).join(", ")
      throw new Error(`Unknown device: ${opts.device}. Available: ${available}`)
    }
    return {
      viewport: device.viewport,
      userAgent: device.userAgent,
      deviceScaleFactor: device.deviceScaleFactor,
      isMobile: device.isMobile,
      hasTouch: device.hasTouch,
    }
  }
  
  if (opts.mobile) {
    return {
      viewport: { width: 390, height: 844 },
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    }
  }
  
  return undefined
}

export function listDevices(): string[] {
  return Object.keys(DEVICES)
}

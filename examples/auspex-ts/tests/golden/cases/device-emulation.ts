// Recorded from unit tests by experiments/slim-tests/record-goldens.ts. Outputs live in ../out/device-emulation.json.
import { type GoldenCases } from "../harness.ts"
import { listDevices, parseDeviceOptions } from "../../../src/device-emulation.ts"

export const cases: GoldenCases = {
  "listDevices()": () => listDevices(),
  "parseDeviceOptions({\"mobile\":true})": () => parseDeviceOptions(({"mobile":true} as never)),
  "parseDeviceOptions({\"device\":\"iphone-13-pro\"})": () => parseDeviceOptions(({"device":"iphone-13-pro"} as never)),
}

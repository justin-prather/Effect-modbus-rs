import { type AsyncRtuTransport, type AsyncSerialModbusClient, type RtuTransportOptions } from "modbus-rs";
import { Effect, Layer } from "effect";
import { makeTransportScoped } from "./shared-transport.js";
import { makeMockTransport } from "./mocks.js";
import type { SlaveDeviceDefinitions } from "./mocks.js";

export class RtuTransportService extends Effect.Service<RtuTransportService>()(
  "RtuTransportService",
  {
    scoped: makeTransportScoped<RtuTransportOptions, AsyncSerialModbusClient, AsyncRtuTransport>(
      "AsyncRtuTransport",
      (TC: unknown, options: RtuTransportOptions) =>
        (TC as typeof AsyncRtuTransport).open(options),
      "RtuTransportService",
    ),
  },
) {
  static makeMockTransport = (devices: SlaveDeviceDefinitions) => {
    const factory = makeMockTransport(devices);
    return (options: RtuTransportOptions) =>
      Layer.scoped(
        RtuTransportService,
        factory(options) as unknown as Effect.Effect<RtuTransportService>,
      );
  };
}

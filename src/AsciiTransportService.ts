import {
  type AsyncAsciiTransport,
  type AsyncSerialModbusClient,
  type AsciiTransportOptions,
} from "modbus-rs";
import { Effect, Layer } from "effect";
import { makeTransportScoped } from "./shared-transport.js";
import { makeMockTransport, SlaveDeviceDefinitions } from "./mocks.js";

export class AsciiTransportService extends Effect.Service<AsciiTransportService>()(
  "AsciiTransportService",
  {
    scoped: makeTransportScoped<AsciiTransportOptions, AsyncSerialModbusClient, AsyncAsciiTransport>(
      "AsyncAsciiTransport",
      (TC: unknown, options: AsciiTransportOptions) =>
        (TC as typeof AsyncAsciiTransport).open(options),
      "AsciiTransportService",
    ),
  },
) {
  static makeMockTransport = (devices: SlaveDeviceDefinitions) => {
    const factory = makeMockTransport(devices);
    return (options: AsciiTransportOptions) =>
      Layer.scoped(
        AsciiTransportService,
        factory(options) as unknown as Effect.Effect<AsciiTransportService>,
      );
  };
}

import { type AsyncTcpModbusClient, type AsyncTcpTransport, type TcpTransportOptions } from "modbus-rs";
import { Effect, Layer } from "effect";
import { makeTransportScoped } from "./shared-transport.js";
import { SlaveDeviceDefinitions, makeMockTransport } from "./mocks.js";

export class TcpTransportService extends Effect.Service<TcpTransportService>()(
  "TcpTransportService",
  {
    scoped: makeTransportScoped<TcpTransportOptions, AsyncTcpModbusClient, AsyncTcpTransport>(
      "AsyncTcpTransport",
      (TC: unknown, options: TcpTransportOptions) =>
        (TC as typeof AsyncTcpTransport).connect(options),
      "TcpTransportService",
    ),
  },
) {
  static makeMockTransport = (devices: SlaveDeviceDefinitions) => {
    const factory = makeMockTransport(devices);
    return (options: TcpTransportOptions) =>
      Layer.scoped(
        TcpTransportService,
        factory(options) as unknown as Effect.Effect<TcpTransportService>,
      );
  };
}

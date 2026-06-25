import { type AsyncRtuTransport, type AsyncSerialModbusClient, type RtuTransportOptions } from "modbus-rs";
import { Effect } from "effect";
import { toModbusError } from "./errors.js";
import { makeEffectModbusClient } from "./modbus-client.js";

export class RtuTransportService extends Effect.Service<RtuTransportService>()(
  "RtuTransportService",
  {
    scoped: Effect.fnUntraced(function* (options: RtuTransportOptions) {
      const { AsyncRtuTransport } = yield* Effect.promise(
        () => import("modbus-rs"),
      );

      const transport: AsyncRtuTransport = yield* Effect.tryPromise({
        try: () => AsyncRtuTransport.open(options),
        catch: (error) => toModbusError(error as Error),
      });
      const clientSet = new Map<number, AsyncSerialModbusClient>();

      yield* Effect.addFinalizer(() => Effect.promise(() => transport.close()));

      return {
        withClient: Effect.fnUntraced(function* (unitId: number) {
          let client = clientSet.get(unitId);
          if (!client) {
            client = yield* Effect.try({
              try: () => transport.createClient({ unitId }),
              catch: (error) => toModbusError(error as Error),
            });
            clientSet.set(unitId, client);
          }
          return makeEffectModbusClient(client);
        }),
        setRequestTimeout: transport.setRequestTimeout.bind(transport),
        clearRequestTimeout: transport.clearRequestTimeout.bind(transport),
        reconnect: Effect.tryPromise({
          try: () => transport.reconnect(),
          catch: (error) => toModbusError(error as Error),
        }),
        hasPendingRequests: () => transport.pendingRequests,
      };
    }),
  },
) {}

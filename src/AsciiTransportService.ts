import {
  type AsyncAsciiTransport,
  type AsyncSerialModbusClient,
  type AsciiTransportOptions,
} from "modbus-rs";
import { Effect, Exit, Layer, Scope } from "effect";
import { ModbusNotConnectedError, toModbusError } from "./errors.js";
import { makeEffectModbusClient } from "./modbus-client.js";
import { makeMockTransport, SlaveDeviceDefinitions } from "./mocks.js";

/**
 * Effect-TS scoped service wrapping a `modbus-rs` ASCII serial transport.
 *
 * The transport connection is **deferred** — it is not opened until the
 * first call to {@link withClient}. Connection errors surface through
 * `withClient` where they can be handled with `Effect.catchTags`.
 *
 * Device clients are cached per {@link CreateClientOptions.unitId | unitId}
 * so that repeated calls to `withClient` for the same unit share the
 * underlying `AsyncSerialModbusClient`. Each returned client is a
 * lightweight {@link EffectModbusClient} that converts Promise-based
 * upstream calls into `Effect.Effect` with typed error handling.
 *
 * ### Usage
 *
 * ```ts
 * import { AsciiTransportService } from "./AsciiTransportService.js";
 * import { Layer } from "effect";
 *
 * const layer = AsciiTransportService.default({ portPath: "/dev/ttyUSB0", baudRate: 19200 });
 * ```
 *
 * @see AsyncAsciiTransport — Upstream `modbus-rs` ASCII transport class.
 * @see AsciiTransportOptions — Connection options for the serial ASCII port.
 * @see AsyncSerialModbusClient — Client type created by the ASCII transport.
 */
export class AsciiTransportService extends Effect.Service<AsciiTransportService>()(
  "AsciiTransportService",
  {
    scoped: Effect.fnUntraced(function* (options: AsciiTransportOptions) {
      const { AsyncAsciiTransport } = yield* Effect.promise(
        () => import("modbus-rs"),
      );

      let transport: AsyncAsciiTransport | null = null;
      let connectPromise: Promise<AsyncAsciiTransport> | null = null;
      let reconnectPromise: Promise<void> | null = null;

      const clientSet = new Map<number, AsyncSerialModbusClient>();

      let closed = false;

      const ensureOpen = Effect.fnUntraced(function* () {
        if (transport) return transport;
        if (closed) {
          return yield* new ModbusNotConnectedError({
            cause: new Error("Transport has been closed"),
            message: "Transport has been closed",
          });
        }
        if (!connectPromise) {
          connectPromise = AsyncAsciiTransport.open(options);
        }
        const t = yield* Effect.tryPromise({
          try: () => connectPromise!,
          catch: (error) => toModbusError(error as Error),
        }).pipe(
          Effect.catchAll((err) => {
            connectPromise = null;
            return Effect.fail(err);
          }),
        );
        transport = t;
        return t;
      });

      yield* Effect.addFinalizer(() => {
        if (closed) return Effect.void;
        closed = true;
        const t = transport;
        if (!t) return Effect.void;
        return Effect.andThen(
          Effect.logDebug("Closing AsciiTransportService"),
          Effect.promise(() => t.close()),
        );
      });

      const notConnectedMsg = "Transport is not connected. Call withClient() first.";

      return {
        /**
         * Retrieves (or creates and caches) a Modbus client for the
         * given unit ID, wrapping it as an {@link EffectModbusClient}.
         *
         * The underlying transport connection is established lazily on
         * the first call. Connection errors surface through this method
         * as typed {@link ModbusError} variants and can be handled with
         * `Effect.catchTags`.
         *
         * Each client shares the parent serial ASCII transport. Caching
         * avoids redundant `transport.createClient` calls and ensures any
         * `setRequestTimeout`/`clearRequestTimeout` configuration applies
         * consistently.
         *
         * @param unitId - The Modbus unit ID (1-247) of the target device.
         * @returns An `EffectModbusClient` scoped to the transport's
         *          lifetime.
         */
        withClient: Effect.fnUntraced(function* (unitId: number) {
          const t = yield* ensureOpen();
          let client = clientSet.get(unitId);
          if (!client) {
            client = yield* Effect.try({
              try: () => t.createClient({ unitId }),
              catch: (error) => toModbusError(error as Error),
            });
            clientSet.set(unitId, client);
          }
          return makeEffectModbusClient(client!);
        }),

        /**
         * Sets the per-request timeout on the underlying transport.
         *
         * Delegates to {@link AsyncAsciiTransport.setRequestTimeout}.
         *
         * @param timeoutMs - Timeout duration in milliseconds.
         * @returns An Effect that resolves when the timeout has been set.
         */
        setRequestTimeout: Effect.fnUntraced(function* (timeoutMs: number) {
          const t = transport;
          if (!t) {
            return yield* new ModbusNotConnectedError({
              cause: new Error(notConnectedMsg),
              message: notConnectedMsg,
            });
          }
          t.setRequestTimeout(timeoutMs);
        }),

        /**
         * Clears any previously set per-request timeout.
         *
         * Delegates to {@link AsyncAsciiTransport.clearRequestTimeout}.
         *
         * @returns An Effect that resolves when the timeout has been cleared.
         */
        clearRequestTimeout: Effect.fnUntraced(function* () {
          const t = transport;
          if (!t) {
            return yield* new ModbusNotConnectedError({
              cause: new Error(notConnectedMsg),
              message: notConnectedMsg,
            });
          }
          t.clearRequestTimeout();
        }),

        /**
         * Reconnects the transport after a disconnect.
         *
         * If the transport was never connected, this performs the
         * initial connection (same as the first `withClient` call).
         *
         * In a multi-fiber environment, concurrent calls share a single
         * underlying reconnect request — the first call triggers the
         * reconnect and subsequent calls await the same promise.
         *
         * **Does not work after `close()` is called** — `close()` is a
         * terminal action that shuts down the service scope, and the
         * underlying `modbus-rs` transport does not support reconnection
         * once closed.
         *
         * @returns An Effect that resolves when reconnection completes.
         */
        reconnect: Effect.fnUntraced(function* () {
          if (transport) {
            if (!reconnectPromise) {
              reconnectPromise = transport
                .reconnect()
                .then(() => { reconnectPromise = null; })
                .catch((err) => { reconnectPromise = null; throw err; });
            }
            yield* Effect.tryPromise({
              try: () => reconnectPromise!,
              catch: (error) => toModbusError(error as Error),
            });
          } else {
            yield* ensureOpen();
          }
        }),

        /**
         * Closes the transport connection and terminates the service.
         *
         * This is a **terminal action**. The underlying `modbus-rs` transport
         * discards its native handle on close and is not reconnectable. Any
         * subsequent call to `reconnect` or `withClient` will fail.
         *
         * Normally the transport is closed via the scope finalizer, but
         * this method allows explicit early termination. Safe to call
         * multiple times — subsequent calls are no-ops.
         *
         * @returns An Effect that resolves when the transport is closed and
         *          the service scope has been torn down.
         */
        close: Effect.fnUntraced(function* () {
          if (closed) return;
          closed = true;
          const t = transport;
          if (t) {
            yield* Effect.tryPromise({
              try: () => t.close(),
              catch: (error) => toModbusError(error as Error),
            });
          }
          const scope = yield* Effect.scope;
          yield* Scope.close(scope as Scope.CloseableScope, Exit.void);
        }),

        /**
         * Returns whether the transport has any pending (in-flight)
         * Modbus requests.
         *
         * Delegates to {@link AsyncAsciiTransport.pendingRequests}.
         * Returns `false` if the transport has not been opened yet.
         *
         * @returns `true` if there are pending requests, `false` otherwise.
         */
        hasPendingRequests: () => {
          const t = transport;
          if (!t) return false;
          return t.pendingRequests;
        },
      };
    }),
  },
) {
  /**
   * Creates a {@link Layer} that provides a mock ASCII transport for testing.
   *
   * Accepts an array of {@link SlaveDeviceDefinition} describing the simulated
   * Modbus slaves and returns a `Layer` suitable for `Effect.provide`.
   *
   * @param devices - Array of slave device definitions to simulate.
   * @returns A layer factory that takes `AsciiTransportOptions` and returns a
   *          scoped `Layer` providing {@link AsciiTransportService}.
   */
  static makeMockTransport = (devices: SlaveDeviceDefinitions) => {
    const factory = makeMockTransport(devices);
    return (options: AsciiTransportOptions) =>
      Layer.scoped(
        AsciiTransportService,
        factory(options) as unknown as Effect.Effect<AsciiTransportService>,
      );
  };
}

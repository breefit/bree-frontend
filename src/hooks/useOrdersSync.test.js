import { renderHook } from "@testing-library/react";
import useOrdersSync from "./useOrdersSync";
import { getSocket } from "../lib/socket";

jest.mock("../lib/socket", () => ({ getSocket: jest.fn() }));

// Socket.IO security fix: the public tracking page must re-follow its order
// on every (re)connect — rooms do not survive a reconnect — and nothing
// else may ask the server to join a room.
const fakeSocket = (connected) => {
  const handlers = {};
  return {
    connected,
    emitted: [],
    on: jest.fn((event, fn) => {
      handlers[event] = fn;
    }),
    off: jest.fn((event) => {
      delete handlers[event];
    }),
    emit(event, ...args) {
      this.emitted.push([event, ...args]);
    },
    fire(event, payload) {
      handlers[event]?.(payload);
    },
    handlers,
  };
};

test("follows the tracked order immediately and again after every reconnect", () => {
  const socket = fakeSocket(true);
  getSocket.mockReturnValue(socket);
  const onChange = jest.fn();
  const { unmount } = renderHook(() => useOrdersSync(onChange, { trackOrderId: "order-uuid-1" }));

  expect(socket.emitted).toEqual([["order:track", "order-uuid-1"]]);
  socket.fire("connect");
  expect(socket.emitted).toEqual([
    ["order:track", "order-uuid-1"],
    ["order:track", "order-uuid-1"],
  ]);

  socket.fire("order:updated", { id: "order-uuid-1" });
  expect(onChange).toHaveBeenCalledWith({ id: "order-uuid-1" });

  unmount();
  expect(socket.handlers["order:updated"]).toBeUndefined();
  expect(socket.handlers.connect).toBeUndefined();
});

test("admin/customer listeners (no trackOrderId) never emit anything to the server", () => {
  const socket = fakeSocket(true);
  getSocket.mockReturnValue(socket);
  renderHook(() => useOrdersSync(jest.fn()));
  socket.fire("connect");
  expect(socket.emitted).toEqual([]);
});

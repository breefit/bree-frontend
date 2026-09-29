import { useEffect } from "react";
import { getSocket } from "../lib/socket";

// `order:updated` only reaches sockets the server authorized: the admin
// room, the signed-in owner's room, and — via `trackOrderId` — sockets that
// presented an order's UUID (the public tracking page, which may be logged
// out). Tracking-room events are `{ id }` only: a signal to refetch.
const useOrdersSync = (onOrderChange, { trackOrderId } = {}) => {
  useEffect(() => {
    if (!onOrderChange) return;

    const socket = getSocket();

    const handler = (order) => {
      try {
        onOrderChange(order);
      } catch (err) {
        console.warn("useOrdersSync error:", err);
      }
    };

    // Rooms do not survive a reconnect, so re-follow on every connect.
    const follow = () => {
      if (trackOrderId) socket.emit("order:track", trackOrderId);
    };

    socket.on("order:updated", handler);
    socket.on("connect", follow);
    if (socket.connected) follow();

    return () => {
      socket.off("order:updated", handler);
      socket.off("connect", follow);
    };
  }, [onOrderChange, trackOrderId]);
};

export default useOrdersSync;

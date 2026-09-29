import io from "socket.io-client";
import { getAccessToken, getAdminToken } from "./tokenStore";

let socket = null;

const resolveBackendUrl = () => {
  const configured =
    process.env.REACT_APP_BACKEND_URL || process.env.REACT_APP_API_URL || "";
  if (configured) {
    return configured.replace(/\/api\/?$/, "");
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }

  return "";
};

export const getSocket = () => {
  if (!socket) {
    const backendUrl = resolveBackendUrl();

    socket = io(backendUrl, {
      // FIX (Socket.IO security audit): the server now authenticates every
      // handshake and only puts admins / signed-in customers in the rooms
      // that receive order events (bree-backend services/socketAuth.js).
      // The httpOnly session cookies ride along with the handshake; the
      // same in-memory tokens tokenStore attaches as Bearer headers are
      // sent too, for browsers that withhold cross-site cookies (Safari).
      // A function, so every (re)connect sends the CURRENT tokens.
      auth: (cb) =>
        cb({
          token: getAccessToken() || undefined,
          adminToken: getAdminToken() || undefined,
        }),
      withCredentials: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      transports: ["websocket"],
    });

    // socket.on('connect', () => {
    //   console.log('✅ Socket connected:', socket.id);
    // });

    // socket.on('disconnect', () => {
    //   console.log('❌ Socket disconnected');
    // });

    socket.on("connect_error", (err) => {
      console.error("Socket Error:", err.message);
    });
  }

  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

// Rooms are assigned at handshake time, so a login/logout must reconnect
// for the socket to gain (or lose) its admin/customer rooms. No-op before
// any page has opened the socket.
export const refreshSocketAuth = () => {
  if (!socket) return;
  socket.disconnect();
  socket.connect();
};

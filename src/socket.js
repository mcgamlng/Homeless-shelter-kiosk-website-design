import { io } from "socket.io-client";

export function createDashboardSocket(token, onUpdate) {
  const socket = io({
    auth: { token },
    transports: ["websocket", "polling"]
  });
  socket.on("dashboard:update", onUpdate);
  return socket;
}

export function createTvSocket(onUpdate) {
  const socket = io({
    auth: { mode: "tv" },
    transports: ["websocket", "polling"]
  });
  socket.on("tv:update", onUpdate);
  return socket;
}

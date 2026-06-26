import { io } from "socket.io-client";

export function createDashboardSocket(token, onUpdate) {
  const socket = io({
    auth: { token },
    transports: ["websocket", "polling"]
  });
  socket.on("dashboard:update", onUpdate);
  return socket;
}

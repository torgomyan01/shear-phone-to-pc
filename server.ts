import { createServer as createHttpsServer } from "node:https";
import { createServer as createHttpServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { networkInterfaces } from "node:os";
import { parse } from "node:url";
import next from "next";
import { Server as SocketServer } from "socket.io";
import selfsigned from "selfsigned";
import {
  SIGNAL_EVENTS,
  type FacingMode,
  type PhoneOrientation,
  type PhoneOrientationPayload,
  type QualityMode,
  type QualityModePayload,
  type RoomJoinPayload,
  type SignalPayload,
} from "./src/lib/signaling";
import { getLanIPv4 } from "./src/lib/network";

interface RoomState {
  hostId: string;
  phoneId: string | null;
  facingMode: FacingMode;
  orientation: PhoneOrientation;
  quality: QualityMode;
}

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = Number(process.env.PORT ?? 3000);
const useHttps = process.env.DISABLE_HTTPS !== "1";

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const rooms = new Map<string, RoomState>();

const createRoomId = (): string => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let index = 0; index < 6; index += 1) {
    result += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return result;
};

const findRoomBySocket = (
  socketId: string,
): { roomId: string; room: RoomState } | null => {
  for (const [roomId, room] of rooms.entries()) {
    if (room.hostId === socketId || room.phoneId === socketId) {
      return { roomId, room };
    }
  }
  return null;
};

const clearPhone = (roomId: string, room: RoomState): void => {
  room.phoneId = null;
  rooms.set(roomId, room);
};

void app.prepare().then(async () => {
  const requestListener = (
    req: IncomingMessage,
    res: ServerResponse,
  ): void => {
    const parsedUrl = parse(req.url ?? "", true);
    void handle(req, res, parsedUrl);
  };

  const lan = getLanIPv4(networkInterfaces());

  const server = useHttps
    ? createHttpsServer(
        await (async () => {
          const pems = await selfsigned.generate(
            [{ name: "commonName", value: "shear-phone-to-pc" }],
            {
              keySize: 2048,
              algorithm: "sha256",
              extensions: [
                {
                  name: "subjectAltName",
                  altNames: [
                    { type: 2, value: "localhost" },
                    { type: 7, ip: "127.0.0.1" },
                    ...(lan ? [{ type: 7 as const, ip: lan }] : []),
                  ],
                },
              ],
            },
          );

          return { key: pems.private, cert: pems.cert };
        })(),
        requestListener,
      )
    : createHttpServer(requestListener);

  const io = new SocketServer(server, {
    cors: { origin: true },
    transports: ["websocket", "polling"],
  });

  io.on("connection", (socket) => {
    socket.on(SIGNAL_EVENTS.ROOM_CREATE, () => {
      let roomId = createRoomId();
      while (rooms.has(roomId)) {
        roomId = createRoomId();
      }

      rooms.set(roomId, {
        hostId: socket.id,
        phoneId: null,
        facingMode: "environment",
        orientation: "portrait",
        quality: "1080p",
      });

      void socket.join(roomId);

      const protocol = useHttps ? "https" : "http";
      const phoneHost = lan ?? "localhost";
      socket.emit(SIGNAL_EVENTS.ROOM_CREATED, {
        roomId,
        joinUrl: `${protocol}://${phoneHost}:${port}/p/${roomId}`,
      });
    });

    socket.on(SIGNAL_EVENTS.ROOM_JOIN, (payload: RoomJoinPayload) => {
      const room = rooms.get(payload.roomId);

      if (!room) {
        socket.emit(SIGNAL_EVENTS.ROOM_ERROR, {
          message: "Room not found. Open a new session on the PC.",
        });
        return;
      }

      if (payload.role === "host") {
        room.hostId = socket.id;
        rooms.set(payload.roomId, room);
        void socket.join(payload.roomId);
        socket.emit(SIGNAL_EVENTS.ROOM_JOINED, {
          roomId: payload.roomId,
          role: "host",
        });
        return;
      }

      if (room.phoneId && room.phoneId !== socket.id) {
        socket.emit(SIGNAL_EVENTS.ROOM_ERROR, {
          message: "A phone is already connected to this session.",
        });
        return;
      }

      room.phoneId = socket.id;
      rooms.set(payload.roomId, room);
      void socket.join(payload.roomId);

      socket.emit(SIGNAL_EVENTS.ROOM_JOINED, {
        roomId: payload.roomId,
        role: "phone",
      });
      socket.emit(SIGNAL_EVENTS.CAMERA_FACING, {
        facingMode: room.facingMode,
      });
      socket.emit(SIGNAL_EVENTS.QUALITY_MODE, {
        quality: room.quality,
      });
      socket.to(room.hostId).emit(SIGNAL_EVENTS.PHONE_JOINED);
      socket.to(room.hostId).emit(SIGNAL_EVENTS.PHONE_ORIENTATION, {
        orientation: room.orientation,
      });
    });

    socket.on(SIGNAL_EVENTS.QUALITY_MODE, (payload: QualityModePayload) => {
      const found = findRoomBySocket(socket.id);
      if (!found || found.room.hostId !== socket.id) {
        return;
      }

      found.room.quality = payload.quality;
      rooms.set(found.roomId, found.room);

      if (found.room.phoneId) {
        io.to(found.room.phoneId).emit(SIGNAL_EVENTS.QUALITY_MODE, payload);
      }
    });

    socket.on(SIGNAL_EVENTS.PHONE_ORIENTATION, (payload: PhoneOrientationPayload) => {
      const found = findRoomBySocket(socket.id);
      if (!found || found.room.phoneId !== socket.id) {
        return;
      }

      found.room.orientation = payload.orientation;
      rooms.set(found.roomId, found.room);

      io.to(found.room.hostId).emit(SIGNAL_EVENTS.PHONE_ORIENTATION, payload);
    });

    socket.on(SIGNAL_EVENTS.HOST_READY, () => {
      const found = findRoomBySocket(socket.id);
      if (!found || found.room.hostId !== socket.id || !found.room.phoneId) {
        return;
      }

      io.to(found.room.phoneId).emit(SIGNAL_EVENTS.HOST_READY);
    });

    socket.on(SIGNAL_EVENTS.SIGNAL, (payload: SignalPayload) => {
      const found = findRoomBySocket(socket.id);
      if (!found) {
        return;
      }

      const targetId =
        found.room.hostId === socket.id
          ? found.room.phoneId
          : found.room.hostId;

      if (!targetId) {
        return;
      }

      socket.to(targetId).emit(SIGNAL_EVENTS.SIGNAL, payload);
    });

    socket.on(SIGNAL_EVENTS.CAMERA_SWITCH, () => {
      const found = findRoomBySocket(socket.id);
      if (!found || found.room.hostId !== socket.id || !found.room.phoneId) {
        return;
      }

      found.room.facingMode =
        found.room.facingMode === "environment" ? "user" : "environment";
      rooms.set(found.roomId, found.room);

      io.to(found.room.phoneId).emit(SIGNAL_EVENTS.CAMERA_SWITCH, {
        facingMode: found.room.facingMode,
      });
      io.to(found.room.hostId).emit(SIGNAL_EVENTS.CAMERA_FACING, {
        facingMode: found.room.facingMode,
      });
    });

    socket.on(SIGNAL_EVENTS.SESSION_END, () => {
      const found = findRoomBySocket(socket.id);
      if (!found || found.room.hostId !== socket.id) {
        return;
      }

      if (found.room.phoneId) {
        io.to(found.room.phoneId).emit(SIGNAL_EVENTS.SESSION_END);
      }

      rooms.delete(found.roomId);
      void socket.leave(found.roomId);
    });

    socket.on("disconnect", () => {
      const found = findRoomBySocket(socket.id);
      if (!found) {
        return;
      }

      const { roomId, room } = found;

      if (room.hostId === socket.id) {
        if (room.phoneId) {
          io.to(room.phoneId).emit(SIGNAL_EVENTS.HOST_LEFT);
        }
        rooms.delete(roomId);
        return;
      }

      if (room.phoneId === socket.id) {
        clearPhone(roomId, room);
        io.to(room.hostId).emit(SIGNAL_EVENTS.PHONE_LEFT);
      }
    });
  });

  server.listen(port, hostname, () => {
    const address = lan ?? "YOUR_LAN_IP";
    const protocol = useHttps ? "https" : "http";

    console.log(`\nShear Phone → PC ready`);
    console.log(`  Local:   ${protocol}://localhost:${port}`);
    console.log(`  Phone:   ${protocol}://${address}:${port}`);
    if (useHttps) {
      console.log(
        `\nNote: accept the self-signed certificate warning once on the phone browser.\n`,
      );
    }
  });
});

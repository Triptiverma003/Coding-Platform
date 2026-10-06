import { Server, Socket } from 'socket.io';
import http from 'http';
import jwt from 'jsonwebtoken';
import { ServerToClientEvents, ClientToServerEvents, SocketData } from '../types/socket';
import { registerRoomEvents } from './roomEvents';
import { registerCodeEvents } from './codeEvents';

const JWT_SECRET: string = (() => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('Missing JWT_SECRET in .env');
  return secret;
})();

export type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents, {}, SocketData>;

export function initSocketManager(httpServer: http.Server) {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, {}, SocketData>(httpServer, {
    cors: { origin: '*' },
  });

  // Auth middleware — runs once per connection, before any events are allowed
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error('Missing auth token'));
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
      socket.data.userId = decoded.userId;
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket: TypedSocket) => {
    console.log(`Socket connected: ${socket.id} (user ${socket.data.userId})`);

    registerRoomEvents(io, socket);
    registerCodeEvents(io, socket);
    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
}
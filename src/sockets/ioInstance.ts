import type { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents, SocketData } from '../types/socket';

export type TypedServer = Server<ClientToServerEvents, ServerToClientEvents, {}, SocketData>;

let ioRef: TypedServer | null = null;

export const setIo = (io: TypedServer) => {
  ioRef = io;
};

export const getIo = () => ioRef;
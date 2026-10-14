import { Server } from 'socket.io';
import { ServerToClientEvents, ClientToServerEvents, SocketData } from '../types/socket';
import { TypedSocket } from './socketManage';
import { getVerifiedRoomPlayers, getRoomState } from '../services/roomCache';
import { getLevelQuestion } from '../services/roomCache';
import { getPlayerProgress, levelStartedPayload } from '../services/gameEngine';

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents, {}, SocketData>;

export function registerRoomEvents(io: TypedServer, socket: TypedSocket) {
  socket.on('join_room', async ({ roomId }) => {
    const userId = socket.data.userId;

    const progress = await getPlayerProgress(roomId, userId);
    if (progress && !progress.allCleared) {
      const question = await getLevelQuestion(roomId, progress.currentLevel);
    if (question) socket.emit('level_started', levelStartedPayload(progress.currentLevel, question));
    }

    try {
      const playerIds = await getVerifiedRoomPlayers(roomId, userId);

      if (!playerIds) {
        socket.emit('error', { message: 'You are not a player in this room' });
        return;
      }

      socket.join(roomId);

      io.to(roomId).emit('player_joined', { userId, totalPlayers: playerIds.length });

      // Covers reconnects and a 2nd player whose socket connects slightly late
      const room = await getRoomState(roomId);
      if (room?.status === 'active' && room.startTime && room.durationSeconds) {
        socket.emit('timer_started', {
          startTime: room.startTime,
          durationSeconds: room.durationSeconds,
        });
      }
    } catch (err) {
      console.error('join_room error:', err instanceof Error ? err.message : err);
      socket.emit('error', { message: 'Could not join room. Please try again.' });
    }
  });
}
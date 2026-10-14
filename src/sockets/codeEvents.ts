import { Server } from 'socket.io';
import { runAgainstTestCases } from '../services/execution';
import {
  getPlayerProgress,
  recordSubmission,
  finalizeRoom,
  levelStartedPayload,
  RejectionReason,
} from '../services/gameEngine';
import { getRoomState, getLevelQuestion } from '../services/roomCache';
import { ServerToClientEvents, ClientToServerEvents, SocketData } from '../types/socket';
import { TypedSocket } from './socketManage';

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents, {}, SocketData>;

const REJECTION_MESSAGES: Record<RejectionReason, string> = {
  not_a_player: 'You are not a player in this room',
  already_finished: 'You have already cleared every level',
  level_changed: 'Your level changed while this was running. Submit again.',
  room_not_active: 'The match is over or has not started',
};

export function registerCodeEvents(io: TypedServer, socket: TypedSocket) {
  socket.on('submit_code', async ({ roomId, code, language }) => {
    const userId = socket.data.userId;

    try {
      const progress = await getPlayerProgress(roomId, userId);
      if (!progress) {
        socket.emit('error', { message: REJECTION_MESSAGES.not_a_player });
        return;
      }
      if (progress.allCleared) {
        socket.emit('error', { message: REJECTION_MESSAGES.already_finished });
        return;
      }

      const room = await getRoomState(roomId);
      if (!room || room.status !== 'active' || !room.startTime || !room.durationSeconds) {
        socket.emit('error', { message: REJECTION_MESSAGES.room_not_active });
        return;
      }

      const endsAt = new Date(room.startTime).getTime() + room.durationSeconds * 1000;
      if (Date.now() >= endsAt) {
        const fin = await finalizeRoom(roomId);
        if (fin.finalized) io.to(roomId).emit('room_finished', { winnerId: fin.winnerId });
        socket.emit('error', { message: 'Time is up' });
        return;
      }

      // The server decides the level, never the client
      const question = await getLevelQuestion(roomId, progress.currentLevel);
      if (!question) {
        socket.emit('error', { message: 'Could not load the question for your level' });
        return;
      }

      const result = await runAgainstTestCases(code, language, question.testCases);
      const outcome = await recordSubmission(roomId, progress.playerId, progress.currentLevel, result, language, code);

      if (!outcome.accepted) {
        if (outcome.reason === 'room_not_active') {
          const fin = await finalizeRoom(roomId);
          if (fin.finalized) io.to(roomId).emit('room_finished', { winnerId: fin.winnerId });
        }
        socket.emit('error', { message: REJECTION_MESSAGES[outcome.reason] });
        return;
      }

      socket.emit('submission_result', {
        level: progress.currentLevel,
        testCasesPassed: result.testCasesPassed,
        totalTestCases: result.totalTestCases,
        levelPoints: outcome.levelPoints,
        totalPoints: outcome.totalPoints,
        levelCleared: outcome.levelCleared,
      });

      socket.to(roomId).emit('opponent_progress', {
        level: outcome.newLevel,
        totalPoints: outcome.totalPoints,
        levelCleared: outcome.levelCleared,
      });

      if (outcome.won) {
        io.to(roomId).emit('room_finished', { winnerId: userId });
        return;
      }

      if (outcome.levelCleared && !outcome.allCleared) {
        const next = await getLevelQuestion(roomId, outcome.newLevel);
        if (next) socket.emit('level_started', levelStartedPayload(outcome.newLevel, next));
      }
    } catch (err) {
      console.error('Submission error:', err instanceof Error ? err.message : err);
      socket.emit('error', { message: 'Code execution failed. Please try again.' });
    }
  });
}
import { finalizeRoom, levelStartedPayload } from './gameEngine';
import { getLevelQuestion } from './roomCache';
import { getIo } from '../sockets/ioInstance';

const EXPIRY_BUFFER_MS = 1000;

export async function startMatch(roomId: string, startTime: string, durationSeconds: number): Promise<void> {
  try {
    const io = getIo();
    if (io) {
      io.to(roomId).emit('timer_started', { startTime, durationSeconds });
      const question = await getLevelQuestion(roomId, 1);
      if (question) io.to(roomId).emit('level_started', levelStartedPayload(1, question));
    }
  } catch (err) {
    console.error('startMatch announce failed:', err instanceof Error ? err.message : err);
  }

  const endsAt = new Date(startTime).getTime() + durationSeconds * 1000;
  const delay = Math.max(endsAt - Date.now(), 0) + EXPIRY_BUFFER_MS;

  setTimeout(async () => {
    try {
      const result = await finalizeRoom(roomId);
      if (result.finalized) {
        getIo()?.to(roomId).emit('room_finished', { winnerId: result.winnerId });
      }
    } catch (err) {
      console.error('Match expiry failed:', err instanceof Error ? err.message : err);
    }
  }, delay);
}
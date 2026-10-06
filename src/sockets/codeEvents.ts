import { Server } from 'socket.io';
import { supabase } from '../db/supabase';
import { runAgainstTestCases } from '../services/execution';
import { processSubmission } from '../services/gameEngine';
import { ServerToClientEvents, ClientToServerEvents, SocketData } from '../types/socket';
import { TypedSocket } from './socketManage';

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents, {}, SocketData>;

export function registerCodeEvents(io: TypedServer, socket: TypedSocket) {
  socket.on('submit_code', async ({ roomId, code, language }) => {
    const userId = socket.data.userId;

    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('id')
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .maybeSingle();

    if (playerError || !player) {
      socket.emit('error', { message: 'You are not a player in this room' });
      return;
    }

    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('question_id, status')
      .eq('id', roomId)
      .single();

    if (roomError || !room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    if (room.status !== 'active') {
      socket.emit('error', { message: 'This room is not currently active' });
      return;
    }

    const { data: question, error: qError } = await supabase
      .from('questions')
      .select('test_cases')
      .eq('id', room.question_id)
      .single();

    if (qError || !question) {
      socket.emit('error', { message: 'Could not load question for this room' });
      return;
    }

    try {
      const result = await runAgainstTestCases(code, language, question.test_cases);
      const outcome = await processSubmission(roomId, player.id, userId, result);

      // Tell the submitting player their own detailed result
      socket.emit('opponent_submitted', {
        passed: outcome.allPassed,
        testCasesPassed: result.testCasesPassed,
        totalTestCases: result.totalTestCases,
      });

      // Tell everyone else in the room that someone submitted (without leaking their code)
      socket.to(roomId).emit('opponent_submitted', {
        passed: outcome.allPassed,
        testCasesPassed: result.testCasesPassed,
        totalTestCases: result.totalTestCases,
      });

      if (outcome.isWinner) {
        io.to(roomId).emit('room_finished', { winnerId: userId });
      }
    } catch (err) {
      socket.emit('error', { message: 'Code execution failed. Please try again.' });
      console.error('Submission error:', err instanceof Error ? err.message : err);
    }
  });
}
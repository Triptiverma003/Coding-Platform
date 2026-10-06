import { Response } from 'express';
import { supabase } from '../db/supabase';
import { AuthRequest } from '../middleware/authmiddleware';


function generateRoomCode(length = 6): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function createRoom(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const durationSeconds = req.body?.durationSeconds ?? 3600;

  try {
    const { data: questions, error: qError } = await supabase
      .from('questions')
      .select('id')
      .limit(50);

    if (qError) throw new Error(qError.message);
    if (!questions || questions.length === 0) {
      return res.status(500).json({ error: 'No questions available yet' });
    }

    const question = questions[Math.floor(Math.random() * questions.length)];

    if (!question) {
  return res.status(500).json({ error: 'Failed to select a question' });
}

    let room = null;
    for (let attempt = 0; attempt < 5 && !room; attempt++) {
      const code = generateRoomCode();
      const { data, error } = await supabase
        .from('rooms')
        .insert({
          code,
          question_id: question.id,
          creator_id: userId,
          status: 'waiting',
          duration_seconds: durationSeconds,
        })
        .select('id, code, status, duration_seconds')
        .single();

      if (error) {
        if (error.code === '23505') continue; 
        throw new Error(error.message);
      }
      room = data;
    }

    if (!room) {
      return res.status(500).json({ error: 'Could not generate a unique room code, try again' });
    }

    const { error: playerError } = await supabase
      .from('players')
      .insert({ room_id: room.id, user_id: userId, slot: 1 });

    if (playerError) throw new Error(playerError.message);

    return res.status(201).json({ room });
  } catch (err) {
    console.error('Create room error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}


export async function joinRoom(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const { code } = req.params;

  if (!code) {
  return res.status(400).json({ error: 'Room code is required' });
}

  try {
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('id, status, duration_seconds, question_id')
      .eq('code' , code.toUpperCase())
      .single();

    if (roomError || !room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    if (room.status !== 'waiting') {
      return res.status(409).json({ error: 'Room is no longer accepting players' });
    }

    const { data: existingPlayer } = await supabase
      .from('players')
      .select('id')
      .eq('room_id', room.id)
      .eq('user_id', userId)
      .maybeSingle();

    if (existingPlayer) {
      return res.status(200).json({ room, alreadyJoined: true });
    }

    const { error: joinError } = await supabase
      .from('players')
      .insert({ room_id: room.id, user_id: userId, slot: 2 });

    if (joinError) {
      if (joinError.code === '23505') {
        return res.status(409).json({ error: 'Room is already full' });
      }
      throw new Error(joinError.message);
    }

    const { data: updatedRoom, error: updateError } = await supabase
      .from('rooms')
      .update({ status: 'active', start_time: new Date().toISOString() })
      .eq('id', room.id)
      .eq('status', 'waiting') // guards against a concurrent double-activation
      .select('id, code, status, start_time, duration_seconds, question_id')
      .single();

    if (updateError) throw new Error(updateError.message);

    return res.status(200).json({ room: updatedRoom });
  } catch (err) {
    console.error('Join room error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
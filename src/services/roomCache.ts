import { redisClient } from '../db/redis';
import { supabase } from '../db/supabase';

const TTL_SECONDS = 60 * 60 * 3; // an expired key is just a cache miss, so this is harmless

const playersKey = (roomId: string) => `room:${roomId}:players`;
const stateKey = (roomId: string) => `room:${roomId}:state`;

export interface RoomState {
  status: string;
  startTime: string | null;
  durationSeconds: number | null;
}

async function loadPlayerIds(roomId: string): Promise<string[]> {
  try {
    if (redisClient.isReady) {
      const cached = await redisClient.sMembers(playersKey(roomId));
      if (cached.length > 0) return cached;
    }
  } catch (err) {
    console.error('[Cache] players read failed:', err instanceof Error ? err.message : err);
  }

  const { data, error } = await supabase
    .from('players')
    .select('user_id')
    .eq('room_id', roomId);

  if (error) throw new Error(error.message);

  const ids = (data ?? []).map((p) => p.user_id as string);

  if (ids.length > 0) {
    try {
      if (redisClient.isReady) {
        await redisClient
          .multi()
          .sAdd(playersKey(roomId), ids)
          .expire(playersKey(roomId), TTL_SECONDS)
          .exec();
      }
    } catch (err) {
      console.error('[Cache] players write failed:', err instanceof Error ? err.message : err);
    }
  }

  return ids;
}

export async function getVerifiedRoomPlayers(roomId: string, userId: string): Promise<string[] | null> {
  const ids = await loadPlayerIds(roomId);
  if (ids.includes(userId)) return ids;

  await invalidateRoomCache(roomId);
  const fresh = await loadPlayerIds(roomId);
  return fresh.includes(userId) ? fresh : null;
}

export async function getRoomState(roomId: string): Promise<RoomState | null> {
  try {
    if (redisClient.isReady) {
      const { status, startTime, durationSeconds } = await redisClient.hGetAll(stateKey(roomId));
      if (status) {
        return {
          status,
          startTime: startTime || null,
          durationSeconds: durationSeconds ? Number(durationSeconds) : null,
        };
      }
    }
  } catch (err) {
    console.error('[Cache] state read failed:', err instanceof Error ? err.message : err);
  }

  const { data, error } = await supabase
    .from('rooms')
    .select('status, start_time, duration_seconds')
    .eq('id', roomId)
    .single();

  if (error || !data) return null;

  const state: RoomState = {
    status: data.status,
    startTime: data.start_time ?? null,
    durationSeconds: data.duration_seconds ?? null,
  };

  // Only cache once active: a waiting room is about to change, and start_time
  // and duration never change after activation.
  if (state.status === 'active' && state.startTime && state.durationSeconds) {
    try {
      if (redisClient.isReady) {
        await redisClient
          .multi()
          .hSet(stateKey(roomId), {
            status: state.status,
            startTime: state.startTime,
            durationSeconds: String(state.durationSeconds),
          })
          .expire(stateKey(roomId), TTL_SECONDS)
          .exec();
      }
    } catch (err) {
      console.error('[Cache] state write failed:', err instanceof Error ? err.message : err);
    }
  }

  return state;
}

export async function invalidateRoomCache(roomId: string): Promise<void> {
  try {
    if (redisClient.isReady) {
      await redisClient.del([playersKey(roomId), stateKey(roomId)]);
    }
  } catch (err) {
    console.error('[Cache] invalidate failed:', err instanceof Error ? err.message : err);
  }
}
const levelKey = (roomId: string, level: number) => `room:${roomId}:level:${level}`;

export interface LevelQuestion {
  id: string;
  title: string;
  description: string;
  testCases: { input: unknown; output: unknown }[];
}

export async function getLevelQuestion(roomId: string, level: number): Promise<LevelQuestion | null> {
  try {
    if (redisClient.isReady) {
      const cached = await redisClient.get(levelKey(roomId, level));
      if (cached) return JSON.parse(cached) as LevelQuestion;
    }
  } catch (err) {
    console.error('[Cache] level read failed:', err instanceof Error ? err.message : err);
  }

  const { data: link, error: linkError } = await supabase
    .from('room_questions')
    .select('question_id')
    .eq('room_id', roomId)
    .eq('level', level)
    .maybeSingle();

  if (linkError) throw new Error(linkError.message);
  if (!link) return null;

  const { data: q, error: qError } = await supabase
    .from('questions')
    .select('id, title, description, test_cases')
    .eq('id', link.question_id)
    .single();

  if (qError || !q) return null;

  const question: LevelQuestion = {
    id: q.id,
    title: q.title,
    description: q.description,
    testCases: q.test_cases,
  };

  try {
    if (redisClient.isReady) {
      await redisClient.set(levelKey(roomId, level), JSON.stringify(question), { EX: TTL_SECONDS });
    }
  } catch (err) {
    console.error('[Cache] level write failed:', err instanceof Error ? err.message : err);
  }

  return question;
}
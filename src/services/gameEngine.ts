import { supabase } from '../db/supabase';
import { ExecutionResult } from './execution';
import { invalidateRoomCache } from './roomCache';

export const LEVELS: number[] = [1, 2, 3];
export const MAX_LEVEL = LEVELS.length;

export const levelMaxPoints = (level: number) => level * 100;

export function levelStartedPayload(level: number, question: { title: string; description: string }) {
  return {
    level,
    maxLevel: MAX_LEVEL,
    maxPoints: levelMaxPoints(level),
    title: question.title,
    description: question.description,
  };
}

export interface PlayerProgress {
  playerId: string;
  currentLevel: number;
  points: number;
  allCleared: boolean;
}

export async function getPlayerProgress(roomId: string, userId: string): Promise<PlayerProgress | null> {
  const { data, error } = await supabase
    .from('players')
    .select('id, current_level, points, all_passed')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    playerId: data.id,
    currentLevel: data.current_level,
    points: data.points,
    allCleared: data.all_passed,
  };
}

export type RejectionReason = 'not_a_player' | 'already_finished' | 'level_changed' | 'room_not_active';

export type RecordedSubmission =
  | { accepted: false; reason: RejectionReason }
  | {
      accepted: true;
      levelPoints: number;
      totalPoints: number;
      levelCleared: boolean;
      newLevel: number;
      allCleared: boolean;
      won: boolean;
    };

interface RecordSubmissionRow {
  accepted: boolean;
  reason?: RejectionReason;
  level_points?: number;
  total_points?: number;
  level_cleared?: boolean;
  new_level?: number;
  all_cleared?: boolean;
  won?: boolean;
}

export async function recordSubmission(
  roomId: string,
  playerId: string,
  level: number,
  result: ExecutionResult,
  language: string,
  code: string
): Promise<RecordedSubmission> {
  const { data, error } = await supabase.rpc('record_submission', {
    p_room_id: roomId,
    p_player_id: playerId,
    p_level: level,
    p_passed: result.testCasesPassed,
    p_total: result.totalTestCases,
    p_language: language,
    p_code: code,
  });

  if (error) throw new Error(error.message);

  const row = data as RecordSubmissionRow;

  if (!row.accepted) {
    return { accepted: false, reason: row.reason ?? 'room_not_active' };
  }

  if (row.won) await invalidateRoomCache(roomId);

  return {
    accepted: true,
    levelPoints: row.level_points ?? 0,
    totalPoints: row.total_points ?? 0,
    levelCleared: row.level_cleared ?? false,
    newLevel: row.new_level ?? level,
    allCleared: row.all_cleared ?? false,
    won: row.won ?? false,
  };
}

export async function finalizeRoom(roomId: string): Promise<{ finalized: boolean; winnerId: string | null }> {
  const { data, error } = await supabase.rpc('finalize_room', { p_room_id: roomId });

  if (error) throw new Error(error.message);

  const row = data as { finalized: boolean; winner_id?: string | null };

  if (row.finalized) await invalidateRoomCache(roomId);

  return { finalized: row.finalized, winnerId: row.winner_id ?? null };
}
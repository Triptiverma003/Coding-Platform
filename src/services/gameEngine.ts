import { supabase } from '../db/supabase';
import { ExecutionResult } from './execution';

export interface SubmissionOutcome {
  points: number;
  allPassed: boolean;
  isWinner: boolean;
}

export async function processSubmission(
  roomId: string,
  playerId: string,
  userId: string,
  result: ExecutionResult
): Promise<SubmissionOutcome> {
  const points = Math.round((result.testCasesPassed / result.totalTestCases) * 100);
  const allPassed = result.passed;

  // Update this player's best result — only overwrite if this attempt scored higher
  // than whatever they already had, so a worse retry can't lower their score
  const { data: currentPlayer } = await supabase
    .from('players')
    .select('points')
    .eq('id', playerId)
    .single();

  if (!currentPlayer || points > currentPlayer.points) {
    await supabase
      .from('players')
      .update({
        points,
        test_cases_passed: result.testCasesPassed,
        all_passed: allPassed,
        submitted_at: new Date().toISOString(),
      })
      .eq('id', playerId);
  }

  // Log every attempt for the audit trail, regardless of whether it improved their score
  await supabase.from('submissions').insert({
    room_id: roomId,
    player_id: playerId,
    passed: allPassed,
    test_cases_passed: result.testCasesPassed,
    total_test_cases: result.totalTestCases,
  });

  let isWinner = false;

  if (allPassed) {
    // The atomic conditional update — same pattern as before.
    // Whoever's "all tests passed" update lands first wins the WHERE clause race.
    const { data: updatedRoom } = await supabase
      .from('rooms')
      .update({ winner_id: userId, status: 'finished', finished_at: new Date().toISOString() })
      .eq('id', roomId)
      .eq('status', 'active')
      .select('id')
      .single();

    isWinner = !!updatedRoom;
  }

  return { points, allPassed, isWinner };
}
export interface ServerToClientEvents {
  player_joined: (data: { userId: string; totalPlayers: number }) => void;
  timer_started: (data: { startTime: string; durationSeconds: number }) => void;
  level_started: (data: {
    level: number;
    maxLevel: number;
    maxPoints: number;
    title: string;
    description: string;
  }) => void;
  submission_result: (data: {
    level: number;
    testCasesPassed: number;
    totalTestCases: number;
    levelPoints: number;
    totalPoints: number;
    levelCleared: boolean;
  }) => void;
  opponent_progress: (data: { level: number; totalPoints: number; levelCleared: boolean }) => void;
  room_finished: (data: { winnerId: string | null }) => void;
  error: (data: { message: string }) => void;
}

export interface ClientToServerEvents {
  join_room: (data: { roomId: string }) => void;
  submit_code: (data: { roomId: string; code: string; language: string }) => void;
}

export interface SocketData {
  userId: string;
}
export interface ServerToClientEvents {
  player_joined: (data: { userId: string; totalPlayers: number }) => void;
  timer_started: (data: { startTime: string; durationSeconds: number }) => void;
  opponent_submitted: (data: { passed: boolean; testCasesPassed: number; totalTestCases: number }) => void;
  room_finished: (data: { winnerId: string }) => void;
  error: (data: { message: string }) => void;
}

export interface ClientToServerEvents {
  join_room: (data: { roomId: string }) => void;
  submit_code: (data: { roomId: string; code: string; language: string }) => void;
}

export interface SocketData {
  userId: string;
}
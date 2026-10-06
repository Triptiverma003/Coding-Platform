import { Server } from 'socket.io';
import { supabase } from '../db/supabase';
import { ServerToClientEvents, ClientToServerEvents, SocketData } from '../types/socket';
import { TypedSocket } from './socketManage';

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents, {}, SocketData>;

export function registerRoomEvents(io: TypedServer, socket: TypedSocket) {
  socket.on('join_room', async ({ roomId }) => {
    const userId = socket.data.userId;

    // Confirm this user is actually a player in this room before letting them into the channel
    const { data: player, error } = await supabase
      .from('players')
      .select('id')
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !player) {
      socket.emit('error', { message: 'You are not a player in this room' });
      return;
    }

    socket.join(roomId);

    const { data: allPlayers } = await supabase
      .from('players')
      .select('user_id')
      .eq('room_id', roomId);

    io.to(roomId).emit('player_joined', {
      userId,
      totalPlayers: allPlayers?.length ?? 0,
    });

    // If the room is already active (both players present), tell this socket
    // the timer info immediately — covers reconnects and the 2nd player joining sockets slightly late
    const { data: room } = await supabase
      .from('rooms')
      .select('status, start_time, duration_seconds')
      .eq('id', roomId)
      .single();

    if (room?.status === 'active' && room.start_time && room.duration_seconds) {
      socket.emit('timer_started', {
        startTime: room.start_time,
        durationSeconds: room.duration_seconds,
      });
    }
  });
}
import { io } from 'socket.io-client';
import axios from 'axios';

const BASE_URL = 'http://localhost:8000/api/v1';

async function registerOrLogin(email: string, username: string, password: string) {
  try {
    const res = await axios.post(`${BASE_URL}/register`, { email, username, password });
    return res.data.token as string;
  } catch {
    const res = await axios.post(`${BASE_URL}/login`, { email, password });
    return res.data.token as string;
  }
}

async function runTest() {
  console.log('Logging in both players...');
  const tokenA = await registerOrLogin('playerA@test.com', 'playerA', 'password123');
  const tokenB = await registerOrLogin('playerB@test.com', 'playerB', 'password123');

  console.log('Player A creating room...');
  const createRes = await axios.post(
    `${BASE_URL}/rooms`,
    {},
    { headers: { Authorization: `Bearer ${tokenA}` } }
  );
  const room = createRes.data.room;
  console.log('Room created:', room.code, room.id);

  console.log('Player B joining room...');
  await axios.post(
    `${BASE_URL}/rooms/${room.code}/join`,
    {},
    { headers: { Authorization: `Bearer ${tokenB}` } }
  );
  console.log('Player B joined. Room should now be active.');

  const socketA = io('http://localhost:8000', { auth: { token: tokenA } });
  const socketB = io('http://localhost:8000', { auth: { token: tokenB } });

  socketA.on('connect', () => {
    console.log('[A] connected, joining socket room...');
    socketA.emit('join_room', { roomId: room.id });
  });

  socketB.on('connect', () => {
    console.log('[B] connected, joining socket room...');
    socketB.emit('join_room', { roomId: room.id });
  });

  socketA.on('player_joined', (data) => console.log('[A] saw player_joined:', data));
  socketB.on('player_joined', (data) => console.log('[B] saw player_joined:', data));

  socketA.on('timer_started', (data) => console.log('[A] timer_started:', data));
  socketB.on('timer_started', (data) => console.log('[B] timer_started:', data));

  socketA.on('opponent_submitted', (data) => console.log('[A] opponent_submitted event:', data));
  socketB.on('opponent_submitted', (data) => console.log('[B] opponent_submitted event:', data));

  socketA.on('room_finished', (data) => console.log('[A] room_finished:', data));
  socketB.on('room_finished', (data) => console.log('[B] room_finished:', data));

  socketA.on('error', (data) => console.log('[A] error:', data));
  socketB.on('error', (data) => console.log('[B] error:', data));

  // Give both sockets time to join, then have A submit code
  setTimeout(() => {
    console.log('\n[A] submitting code...');
    socketA.emit('submit_code', {
      roomId: room.id,
      code: 'fake code for now',
      language: 'javascript',
    });
  }, 2000);

  // Keep the script alive long enough to see all events, then exit
  setTimeout(() => {
    console.log('\nTest complete, closing sockets.');
    socketA.close();
    socketB.close();
    process.exit(0);
  }, 6000);
}

runTest().catch((err) => {
  console.error('Test failed:', err.response?.data || err.message);
  process.exit(1);
});
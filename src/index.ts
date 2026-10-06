import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import { supabase } from './db/supabase';
import authRoutes from './routes/authRoutes';
import cookieParser from 'cookie-parser';
import roomRoutes from './routes/roomRoutes';
import { initSocketManager} from './sockets/socketManage';

dotenv.config();

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/v1', roomRoutes);

const httpServer = http.createServer(app);

const io = initSocketManager(httpServer);
const PORT = process.env.PORT || 8000;

app.get('/health', (req, res) => {
  res.json({ status: 'sab chal rha!' });
});

app.use('/api/v1', authRoutes);

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

async function checkDatabaseConnection(): Promise<void> {
  try {
    const { error } = await supabase.from('rooms').select('id').limit(1);
    if (error) throw new Error(error.message);
    console.log('Database connected successfully');
  } catch (err) {
    console.error('Database connection failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

async function startServer() {
  await checkDatabaseConnection();

  httpServer.listen(PORT, () => {
    console.log(`Server is running on ${PORT}!`);
  });
}

startServer();
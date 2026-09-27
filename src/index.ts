import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import { supabase } from './db/supabase';
import authRoutes from './routes/authRoutes';

dotenv.config();

const app = express();
app.use(express.json());

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: '*', // tighten this to your frontend's actual URL once deployed
  },
});

const PORT = process.env.PORT || 8000;

app.get('/health', (req, res) => {
  res.json({ status: 'sab chal rha!' });
});

app.use('/auth', authRoutes);

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
    console.log('✅ Database connected successfully');
  } catch (err) {
    console.error('❌ Database connection failed:', err instanceof Error ? err.message : err);
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
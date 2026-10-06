import { Router } from 'express';
import { requireAuth } from '../middleware/authmiddleware';
import { createRoom, joinRoom } from '../controllers/roomController';

const router = Router();

router.post('/rooms', requireAuth, createRoom);
router.post('/rooms/:code/join', requireAuth, joinRoom);

export default router;
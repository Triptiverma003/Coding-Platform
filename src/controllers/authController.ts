import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { supabase } from '../db/supabase';

const JWT_SECRET: string = (() => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('Missing JWT_SECRET in .env');
  return secret;
})();

const SALT_ROUNDS = 10;

interface RegisterBody {
  email: string;
  username: string;
  password: string;
}

interface LoginBody {
  email: string;
  password: string;
}

export async function register(req: Request, res: Response) {
  const { email, username, password } = req.body as RegisterBody;

  if (!email || !username || !password) {
    return res.status(400).json({ error: 'email, username, and password are required' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'abee bhadwe theek se 8 character ka password daal na!' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const { data, error } = await supabase
      .from('users')
      .insert({
        email: email.toLowerCase().trim(),
        username: username.trim(),
        password_hash: passwordHash,
      })
      .select('id, email, username')
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'chutiya hai?' });
      }
      throw new Error(error.message);
    }

    const token = jwt.sign({ userId: data.id }, JWT_SECRET, { expiresIn: '7d' });

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days in ms
    });

    return res.status(201).json({
      user: { id: data.id, email: data.email, username: data.username },
      token,
    });
  } catch (err) {
    console.error('Register error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body as LoginBody;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, username, password_hash')
      .eq('email', email.toLowerCase().trim())
      .single();

    // Deliberately identical error for "no user" and "wrong password" below —
    // this stops an attacker from using the login endpoint to figure out
    // which emails are registered on the platform.
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days in ms
    });

    return res.status(200).json({
      message: "chal swagat hai",
      token,
      user: { id: user.id, email: user.email, username: user.username },
    });
  } catch (err) {
    console.error('Login error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
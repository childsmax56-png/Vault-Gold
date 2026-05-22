import { json, options, verifyPassword, generateToken, SESSION_TTL_MS } from '../_auth';

export const onRequestOptions = options;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: { login?: string; password?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { login, password } = body;
  if (!login || !password) return json({ error: 'Missing fields' }, 400);

  const user = await env.DB.prepare(
    'SELECT id, username, email, password_hash FROM users WHERE username = ? OR email = ?'
  ).bind(login.toLowerCase(), login.toLowerCase()).first<{
    id: string; username: string; email: string; password_hash: string;
  }>();

  if (!user || !user.password_hash) return json({ error: 'Invalid credentials' }, 401);

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return json({ error: 'Invalid credentials' }, 401);

  const now = Date.now();
  const token = generateToken();
  await env.DB.prepare(
    'INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)'
  ).bind(token, user.id, now + SESSION_TTL_MS, now).run();

  return json({ token, user: { id: user.id, username: user.username, email: user.email } });
};

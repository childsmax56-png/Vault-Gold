import { json, options, getSession } from '../_auth';

export const onRequestOptions = options;

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const session = await getSession(request, env.DB);
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const result = await env.DB.prepare(
    'SELECT id, url, label, added_at FROM tracker_history WHERE user_id = ? ORDER BY added_at DESC LIMIT 20'
  ).bind(session.user_id).all<{ id: number; url: string; label: string | null; added_at: string }>();

  return json(result.results);
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const session = await getSession(request, env.DB);
  if (!session) return json({ error: 'Unauthorized' }, 401);

  let body: { url?: string; label?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const url = (body.url ?? '').trim();
  if (!url.startsWith('https://docs.google.com/spreadsheets/')) {
    return json({ error: 'Only Google Sheets URLs are allowed' }, 400);
  }

  const label = (body.label ?? '').trim() || null;

  await env.DB.prepare(
    `INSERT INTO tracker_history (user_id, url, label) VALUES (?, ?, ?)
     ON CONFLICT(user_id, url) DO UPDATE SET added_at = datetime('now'), label = COALESCE(excluded.label, label)`
  ).bind(session.user_id, url, label).run();

  return json({ ok: true });
};

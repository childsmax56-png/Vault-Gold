import { json, options, getSession } from '../_auth';

export const onRequestOptions = options;

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  const session = await getSession(request, env.DB);
  if (!session) return json({ error: 'Unauthorized' }, 401);

  let body: { customTrackerUrl?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const url = body.customTrackerUrl ?? null;

  if (url && !url.startsWith('https://docs.google.com/spreadsheets/')) {
    return json({ error: 'Only Google Sheets URLs are allowed' }, 400);
  }

  await env.DB.prepare('UPDATE users SET custom_tracker_url = ? WHERE id = ?')
    .bind(url, session.user_id)
    .run();

  return json({ ok: true });
};

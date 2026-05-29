import { json, options, getSession } from '../_auth';

export const onRequestOptions = options;

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const session = await getSession(request, env.DB);
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const services = await env.DB.prepare(
    'SELECT service, access_token, refresh_token, expires_at, service_username FROM linked_services WHERE user_id = ?'
  ).bind(session.user_id).all<{
    service: string; access_token: string | null; refresh_token: string | null;
    expires_at: number | null; service_username: string | null;
  }>();

  const linked: Record<string, unknown> = {};
  for (const row of services.results) {
    if (row.service === 'spotify') {
      let access_token = row.access_token;
      let expires_at = row.expires_at;

      if (row.refresh_token && row.expires_at && Date.now() > row.expires_at - 5 * 60 * 1000) {
        const refreshed = await refreshSpotifyToken(row.refresh_token, env);
        if (refreshed) {
          access_token = refreshed.access_token;
          expires_at = refreshed.expires_at;
          await env.DB.prepare(
            'UPDATE linked_services SET access_token = ?, expires_at = ?, updated_at = ? WHERE user_id = ? AND service = ?'
          ).bind(access_token, expires_at, Date.now(), session.user_id, 'spotify').run();
        }
      }

      linked.spotify = { access_token, refresh_token: row.refresh_token, expires_at, username: row.service_username };
    } else if (row.service === 'lastfm') {
      linked.lastfm = { session_key: row.access_token, username: row.service_username };
    }
  }

  const userRow = await env.DB.prepare('SELECT custom_tracker_url FROM users WHERE id = ?')
    .bind(session.user_id)
    .first<{ custom_tracker_url: string | null }>();

  return json({
    user: { id: session.user_id, username: session.username, email: session.email },
    linked,
    customTrackerUrl: userRow?.custom_tracker_url ?? null,
  });
};

async function refreshSpotifyToken(refreshToken: string, env: Env) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: env.SPOTIFY_CLIENT_ID,
      client_secret: env.SPOTIFY_CLIENT_SECRET,
    }),
  });
  if (!res.ok) return null;
  const data: { access_token: string; expires_in: number } = await res.json();
  return { access_token: data.access_token, expires_at: Date.now() + data.expires_in * 1000 };
}

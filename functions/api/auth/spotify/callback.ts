import { getSession, CORS_HEADERS } from '../../_auth';

const ALLOWED_RETURN = [
  'https://yzyarchives.org',
  'https://vampgold.pages.dev',
  'https://kdotgold.pages.dev',
  'https://drizzygold.pages.dev',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
];

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const stateRaw = url.searchParams.get('state');
  if (!code || !stateRaw) return errorPage('Missing code or state');

  let state: { token?: string; v?: string; r?: string };
  try { state = JSON.parse(atob(stateRaw)); } catch { return errorPage('Invalid state'); }

  const { token, v: codeVerifier, r: returnTo } = state;
  if (!token || !codeVerifier) return errorPage('Invalid state data');

  const session = await getSession(
    new Request(request.url, { headers: { Authorization: `Bearer ${token}` } }),
    env.DB
  );
  if (!session) return errorPage('Session expired — please sign in again');

  const clientId = env.SPOTIFY_CLIENT_ID || 'c9bdd79bf657487d8973f4c1510523ea';
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${url.origin}/api/auth/spotify/callback`,
      client_id: clientId,
      code_verifier: codeVerifier,
    }),
  });

  if (!res.ok) return errorPage('Spotify token exchange failed');
  const data: { access_token: string; refresh_token: string; expires_in: number } = await res.json();

  const profileRes = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${data.access_token}` },
  });
  const profile: { id?: string; display_name?: string } = profileRes.ok ? await profileRes.json() : {};

  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO linked_services (user_id, service, access_token, refresh_token, expires_at, service_username, updated_at)
     VALUES (?, 'spotify', ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, service) DO UPDATE SET
       access_token = excluded.access_token,
       refresh_token = excluded.refresh_token,
       expires_at = excluded.expires_at,
       service_username = excluded.service_username,
       updated_at = excluded.updated_at`
  ).bind(
    session.user_id,
    data.access_token,
    data.refresh_token,
    now + data.expires_in * 1000,
    profile.display_name || profile.id || null,
    now
  ).run();

  if (returnTo && ALLOWED_RETURN.some(a => returnTo.startsWith(a))) {
    return Response.redirect(`${returnTo}?vg_spotify_linked=1`, 302);
  }

  return new Response(successPage('Spotify'), {
    headers: { 'Content-Type': 'text/html', ...CORS_HEADERS },
  });
};

function errorPage(msg: string) {
  return new Response(`<!doctype html><html><body style="font-family:sans-serif;padding:2rem;background:#050505;color:#fff">
    <h2 style="color:#e55">Error</h2><p>${msg}</p>
    <p><a href="https://vaultgold.net" style="color:#C9A224">Back to VAULTgold</a></p>
  </body></html>`, { status: 400, headers: { 'Content-Type': 'text/html' } });
}

function successPage(service: string) {
  return `<!doctype html><html><head><script>
    try { localStorage.setItem('vg_linked', JSON.stringify({ service: '${service}', t: Date.now() })); } catch(e) {}
    if (window.opener) { window.opener.postMessage({ vaultgold: '${service}_linked' }, '*'); window.close(); }
    else { setTimeout(() => { window.location.href = 'https://vaultgold.net/account'; }, 1500); }
  </script></head><body style="font-family:sans-serif;padding:2rem;background:#050505;color:#fff">
    <p style="color:#C9A224">${service} connected! You can close this window.</p>
  </body></html>`;
}

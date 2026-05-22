import { json, generateToken, generateId, SESSION_TTL_MS, CORS_HEADERS } from '../../_auth';

const ALLOWED_RETURN = [
  'https://yzyarchives.org',
  'https://yzy-gold.pages.dev',
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

  let state: { r?: string };
  try { state = JSON.parse(atob(stateRaw)); } catch { return errorPage('Invalid state'); }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${url.origin}/api/auth/google/callback`,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) return errorPage('Google token exchange failed');
  const tokens: { access_token: string; id_token: string } = await tokenRes.json();

  const payload = decodeJwtPayload(tokens.id_token);
  if (!payload) return errorPage('Invalid Google token');

  const { sub: googleId, email, name } = payload as { sub: string; email: string; name: string };
  if (!googleId || !email) return errorPage('Google account missing email');

  const now = Date.now();

  let user = await env.DB.prepare(
    'SELECT u.id, u.username, u.email FROM oauth_providers op JOIN users u ON u.id = op.user_id WHERE op.provider = ? AND op.provider_id = ?'
  ).bind('google', googleId).first<{ id: string; username: string; email: string }>();

  if (!user) {
    const byEmail = await env.DB.prepare(
      'SELECT id, username, email FROM users WHERE email = ?'
    ).bind(email.toLowerCase()).first<{ id: string; username: string; email: string }>();

    if (byEmail) {
      await env.DB.prepare(
        'INSERT OR IGNORE INTO oauth_providers (id, user_id, provider, provider_id) VALUES (?, ?, ?, ?)'
      ).bind(generateId(), byEmail.id, 'google', googleId).run();
      user = byEmail;
    } else {
      const userId = generateId();
      const username = await uniqueUsername(email.split('@')[0].replace(/[^a-zA-Z0-9_.-]/g, ''), env.DB);
      await env.DB.prepare(
        'INSERT INTO users (id, username, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?)'
      ).bind(userId, username, email.toLowerCase(), now, now).run();
      await env.DB.prepare(
        'INSERT INTO oauth_providers (id, user_id, provider, provider_id) VALUES (?, ?, ?, ?)'
      ).bind(generateId(), userId, 'google', googleId).run();
      user = { id: userId, username, email: email.toLowerCase() };
    }
  }

  const token = generateToken();
  await env.DB.prepare(
    'INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)'
  ).bind(token, user.id, now + SESSION_TTL_MS, now).run();

  const { r: returnTo } = state;
  if (returnTo && ALLOWED_RETURN.some(a => returnTo.startsWith(a))) {
    return Response.redirect(`${returnTo}?vg_token=${token}&vg_user=${encodeURIComponent(JSON.stringify({ id: user.id, username: user.username, email: user.email }))}`, 302);
  }

  return new Response(signedInPage(token, user), { headers: { 'Content-Type': 'text/html', ...CORS_HEADERS } });
};

async function uniqueUsername(base: string, db: D1Database): Promise<string> {
  let username = base.slice(0, 28).toLowerCase() || 'user';
  const existing = await db.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
  if (!existing) return username;
  username = username + Math.floor(Math.random() * 9000 + 1000);
  return username;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const pad = parts[1].length % 4;
    const padded = parts[1] + '='.repeat(pad ? 4 - pad : 0);
    return JSON.parse(atob(padded.replace(/-/g, '+').replace(/_/g, '/')));
  } catch { return null; }
}

function errorPage(msg: string) {
  return new Response(`<!doctype html><html><body style="font-family:sans-serif;padding:2rem;background:#050505;color:#fff">
    <h2 style="color:#e55">Error</h2><p>${msg}</p>
    <p><a href="https://vaultgold.net" style="color:#C9A224">Back to VAULTgold</a></p>
  </body></html>`, { status: 400, headers: { 'Content-Type': 'text/html' } });
}

function signedInPage(token: string, user: { id: string; username: string; email: string }) {
  return `<!doctype html><html><head><script>
    var data = { token: ${JSON.stringify(token)}, user: ${JSON.stringify(user)} };
    if (window.opener) { window.opener.postMessage({ vaultgold: 'signed_in', ...data }, '*'); window.close(); }
    else {
      localStorage.setItem('vg_token', data.token);
      localStorage.setItem('vg_user', JSON.stringify(data.user));
      window.location.href = 'https://vaultgold.net/account';
    }
  </script></head><body style="font-family:sans-serif;padding:2rem;background:#050505;color:#fff">
    <p style="color:#C9A224">Signed in as ${user.username}!</p>
  </body></html>`;
}

import { options, getSession, generateToken, CORS_HEADERS } from '../../_auth';

export const onRequestOptions = options;

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const tokenFromQuery = url.searchParams.get('token') ?? undefined;
  const authRequest = tokenFromQuery
    ? new Request(request.url, { headers: { Authorization: `Bearer ${tokenFromQuery}` } })
    : request;
  const session = await getSession(authRequest, env.DB);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  const returnTo = url.searchParams.get('return_to') || '';
  const sessionToken = tokenFromQuery ?? request.headers.get('Authorization')?.slice(7) ?? '';

  const codeVerifier = generateToken() + generateToken();
  const codeChallenge = await pkceChallenge(codeVerifier);
  const state = btoa(JSON.stringify({ token: sessionToken, v: codeVerifier, r: returnTo }));

  const clientId = env.SPOTIFY_CLIENT_ID || 'c9bdd79bf657487d8973f4c1510523ea';
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: 'streaming user-read-email user-read-private user-modify-playback-state user-read-playback-state',
    redirect_uri: `${url.origin}/api/auth/spotify/callback`,
    state,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
    show_dialog: 'true',
  });

  return Response.redirect(`https://accounts.spotify.com/authorize?${params}`, 302);
};

async function pkceChallenge(verifier: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

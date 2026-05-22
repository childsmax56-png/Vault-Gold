import { options, getSession, CORS_HEADERS } from '../../_auth';

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

  const token = tokenFromQuery ?? request.headers.get('Authorization')?.slice(7) ?? '';
  const returnTo = url.searchParams.get('return_to') || '';
  const state = btoa(JSON.stringify({ token, r: returnTo }));

  const callbackUrl = `${url.origin}/api/auth/lastfm/callback?state=${encodeURIComponent(state)}`;
  const authUrl = `https://www.last.fm/api/auth/?api_key=${env.LASTFM_API_KEY}&cb=${encodeURIComponent(callbackUrl)}`;

  return Response.redirect(authUrl, 302);
};

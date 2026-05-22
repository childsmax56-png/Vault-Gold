import { generateToken, CORS_HEADERS } from '../../_auth';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.GOOGLE_CLIENT_ID) {
    return new Response(JSON.stringify({ error: 'Google sign-in not configured' }), {
      status: 501, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  const url = new URL(request.url);
  const returnTo = url.searchParams.get('return_to') || '';
  const state = btoa(JSON.stringify({ r: returnTo, n: generateToken().slice(0, 16) }));

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${url.origin}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'offline',
    prompt: 'select_account',
  });

  return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`, 302);
};

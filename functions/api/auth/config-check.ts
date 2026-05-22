import { CORS_HEADERS } from '../_auth';

// Temporary diagnostic endpoint — safe to expose (no secrets returned)
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  return new Response(JSON.stringify({
    spotify: {
      client_id: env.SPOTIFY_CLIENT_ID || '(not set — would use hardcoded fallback)',
      client_id_length: (env.SPOTIFY_CLIENT_ID || '').length,
      redirect_uri: `${url.origin}/api/auth/spotify/callback`,
    },
    lastfm: {
      api_key_set: !!env.LASTFM_API_KEY,
      api_key_length: (env.LASTFM_API_KEY || '').length,
      shared_secret_set: !!env.LASTFM_SHARED_SECRET,
      callback_url: `${url.origin}/api/auth/lastfm/callback`,
    },
    google: {
      client_id_set: !!env.GOOGLE_CLIENT_ID,
    },
  }, null, 2), {
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
};

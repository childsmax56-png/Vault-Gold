import { json, options, getSession } from '../_auth';

export const onRequestOptions = options;

export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  const session = await getSession(request, env.DB);
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const url = new URL(request.url);
  const service = url.searchParams.get('service');
  if (service !== 'spotify' && service !== 'lastfm') return json({ error: 'Invalid service' }, 400);

  await env.DB.prepare(
    'DELETE FROM linked_services WHERE user_id = ? AND service = ?'
  ).bind(session.user_id, service).run();

  return json({ ok: true });
};

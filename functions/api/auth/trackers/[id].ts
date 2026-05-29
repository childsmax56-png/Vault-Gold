import { json, options, getSession } from '../../_auth';

export const onRequestOptions = options;

export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  const session = await getSession(request, env.DB);
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const id = parseInt(params.id as string, 10);
  if (isNaN(id)) return json({ error: 'Invalid ID' }, 400);

  await env.DB.prepare('DELETE FROM tracker_history WHERE id = ? AND user_id = ?')
    .bind(id, session.user_id).run();

  return json({ ok: true });
};

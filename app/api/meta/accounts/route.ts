import { env } from 'cloudflare:workers';

export const dynamic = 'force-dynamic';
const graph = (env as unknown as Record<string, string | undefined>).META_GRAPH_VERSION ?? 'v21.0';
const cfg = env as unknown as Record<string, string | undefined>;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });

export async function GET(request: Request) {
  if (!request.headers.get('oai-authenticated-user-id')) return json({ error: 'Sign in to view Meta connections.' }, 401);
  if (!cfg.META_SYSTEM_USER_TOKEN || !cfg.META_PAGE_ID || !cfg.META_IG_USER_ID) return json({ status: 'not_configured', facebook: null, instagram: null });
  const headers = { Authorization: `Bearer ${cfg.META_SYSTEM_USER_TOKEN}` };
  try {
    const [pageRes, igRes] = await Promise.all([
      fetch(`https://graph.facebook.com/${graph}/${cfg.META_PAGE_ID}?fields=id,name,fan_count`, { headers }),
      fetch(`https://graph.facebook.com/${graph}/${cfg.META_IG_USER_ID}?fields=id,username,followers_count,media_count`, { headers }),
    ]);
    if (!pageRes.ok || !igRes.ok) return json({ error: 'Meta could not verify the connected accounts.' }, 502);
    return json({ status: 'connected', facebook: await pageRes.json(), instagram: await igRes.json() });
  } catch { return json({ error: 'Meta connection check failed.' }, 502); }
}

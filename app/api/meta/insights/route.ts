import { env } from 'cloudflare:workers';
export const dynamic = 'force-dynamic';
const cfg = env as unknown as Record<string, string | undefined>;
const graph = cfg.META_GRAPH_VERSION ?? 'v21.0';
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
export async function GET(request: Request) {
  if (!request.headers.get('oai-authenticated-user-id')) return json({ error: 'Sign in to view insights.' }, 401);
  if (!cfg.META_SYSTEM_USER_TOKEN || !cfg.META_PAGE_ID || !cfg.META_IG_USER_ID) return json({ error: 'Meta is not configured.' }, 503);
  const metrics = 'impressions,reach,likes,comments,saved,shares,profile_views';
  const headers = { Authorization: `Bearer ${cfg.META_SYSTEM_USER_TOKEN}` };
  const [fb, ig] = await Promise.all([
    fetch(`https://graph.facebook.com/${graph}/${cfg.META_PAGE_ID}/insights?metric=page_impressions,page_post_engagements,page_fans&period=day`, { headers }),
    fetch(`https://graph.facebook.com/${graph}/${cfg.META_IG_USER_ID}/insights?metric=${metrics}&period=day`, { headers }),
  ]);
  if (!fb.ok || !ig.ok) return json({ error: 'Meta insights are unavailable; advanced access may be required.' }, 502);
  return json({ facebook: await fb.json(), instagram: await ig.json(), source: 'meta', fetchedAt: new Date().toISOString() });
}

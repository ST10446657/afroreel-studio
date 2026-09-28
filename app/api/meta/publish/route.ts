import { env } from 'cloudflare:workers';
export const dynamic = 'force-dynamic';
const cfg = env as unknown as Record<string, string | undefined>;
const graph = cfg.META_GRAPH_VERSION ?? 'v21.0';
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
export async function POST(request: Request) {
  if (!request.headers.get('oai-authenticated-user-id')) return json({ error: 'Sign in to publish.' }, 401);
  if (!cfg.META_SYSTEM_USER_TOKEN || !cfg.META_PAGE_ID || !cfg.META_IG_USER_ID) return json({ error: 'Meta is not configured.' }, 503);
  const body = await request.json().catch(() => null) as { videoUrl?: string; caption?: string } | null;
  if (!body?.videoUrl || !/^https:\/\//i.test(body.videoUrl)) return json({ error: 'A public HTTPS video URL is required.' }, 400);
  const form = new URLSearchParams({ file_url: body.videoUrl, description: body.caption ?? '', access_token: cfg.META_SYSTEM_USER_TOKEN });
  const fb = await fetch(`https://graph.facebook.com/${graph}/${cfg.META_PAGE_ID}/videos`, { method: 'POST', body: form });
  if (!fb.ok) return json({ error: 'Facebook rejected the video.' }, 502);
  const igForm = new URLSearchParams({ media_type: 'REELS', video_url: body.videoUrl, caption: body.caption ?? '', access_token: cfg.META_SYSTEM_USER_TOKEN });
  const igContainer = await fetch(`https://graph.facebook.com/${graph}/${cfg.META_IG_USER_ID}/media`, { method: 'POST', body: igForm });
  if (!igContainer.ok) return json({ facebook: await fb.json(), error: 'Facebook published, but Instagram container creation failed.' }, 502);
  return json({ facebook: await fb.json(), instagram: { container: await igContainer.json(), status: 'created_needs_publish' } }, 202);
}

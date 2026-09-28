import { env } from 'cloudflare:workers';
export const dynamic = 'force-dynamic';
const cfg = env as unknown as Record<string, string | undefined>;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
type Body = { language?: 'zu' | 'en'; platform?: 'tiktok' | 'youtube'; content?: string; title?: string; videoUrl?: string; scheduledFor?: string; mode?: 'dry_run' | 'schedule' };
export async function POST(request: Request) {
  if (!request.headers.get('oai-authenticated-user-id')) return json({ error: 'Sign in to schedule.' }, 401);
  const body = await request.json().catch(() => null) as Body | null;
  if (!body?.language || !body.platform || !body.content?.trim() || !body.videoUrl || !body.scheduledFor) return json({ error: 'Language, platform, caption, HTTPS video URL, and scheduled time are required.' }, 400);
  if (!/^https:\/\//i.test(body.videoUrl)) return json({ error: 'The video must be hosted at a public HTTPS URL.' }, 400);
  const prefix = body.language === 'zu' ? 'ZERNIO_ZU' : 'ZERNIO_EN';
  const key = cfg[`${prefix}_API_KEY`];
  const accountId = cfg[`${prefix}_${body.platform === 'tiktok' ? 'TIKTOK' : 'YOUTUBE'}_ACCOUNT_ID`];
  if (!key || !accountId) return json({ error: 'That language account is not connected.' }, 503);
  const payload = { content: body.content.trim(), title: body.title?.trim(), mediaItems: [{ url: body.videoUrl, type: 'video' }], platforms: [{ platform: body.platform, accountId }], scheduledFor: body.scheduledFor, timezone: 'Africa/Johannesburg' };
  if (body.mode !== 'schedule') return json({ mode: 'dry_run', willPublish: false, platform: body.platform, accountId, payload: { ...payload, mediaItems: [{ type: 'video', attached: true }] }, message: 'Zernio schedule validated. No post was sent.' });
  const response = await fetch('https://zernio.com/api/v1/posts', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const result = await response.json().catch(() => ({}));
  return json(result, response.status);
}

import { env } from 'cloudflare:workers';

export const dynamic = 'force-dynamic';
const cfg = env as unknown as Record<string, string | undefined>;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });

type RequestBody = { language?: 'zu' | 'en'; title?: string; caption?: string; videoUrl?: string; scheduledAt?: string; platforms?: string[] };

export async function POST(request: Request) {
  if (!request.headers.get('oai-authenticated-user-id')) return json({ error: 'Sign in to create a schedule.' }, 401);
  const body = await request.json().catch(() => null) as RequestBody | null;
  if (!body?.language || !['zu', 'en'].includes(body.language) || !body.title?.trim() || !body.scheduledAt) return json({ error: 'Language, title, and scheduled time are required.' }, 400);
  if (body.videoUrl && !/^https:\/\//i.test(body.videoUrl)) return json({ error: 'The video must be available at a public HTTPS URL.' }, 400);
  const platforms = (body.platforms ?? ['Facebook', 'Instagram', 'TikTok', 'YouTube']).filter(p => ['Facebook', 'Instagram', 'TikTok', 'YouTube'].includes(p));
  if (!platforms.length) return json({ error: 'Choose at least one platform.' }, 400);
  const meta=body.language==='zu'?'META':'META_EN',zernio=body.language==='zu'?'ZERNIO_ZU':'ZERNIO_EN';
  const connected = {
    Facebook:Boolean(cfg[`${meta}_SYSTEM_USER_TOKEN`]&&cfg[`${meta}_PAGE_ID`]),
    Instagram:Boolean(cfg[`${meta}_SYSTEM_USER_TOKEN`]&&cfg[`${meta}_IG_USER_ID`]),
    TikTok:Boolean(cfg[`${zernio}_API_KEY`]&&cfg[`${zernio}_TIKTOK_ACCOUNT_ID`]),
    YouTube:Boolean(cfg[`${zernio}_API_KEY`]&&cfg[`${zernio}_YOUTUBE_ACCOUNT_ID`]),
  };
  return json({ mode: 'dry_run', willPublish: false, language: body.language, title: body.title.trim(), scheduledAt: body.scheduledAt, videoAttached: Boolean(body.videoUrl), platforms: platforms.map(platform => ({ platform, connected: connected[platform as keyof typeof connected], status: connected[platform as keyof typeof connected] ? (body.videoUrl ? 'ready' : 'awaiting_video') : 'not_connected' })), message: 'Schedule plan validated. Publishing is disabled until explicitly enabled.' });
}

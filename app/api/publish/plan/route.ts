import { env } from 'cloudflare:workers';

export const dynamic = 'force-dynamic';
const cfg = env as unknown as Record<string, string | undefined>;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });

type RequestBody = { language?: 'zu' | 'en'; title?: string; caption?: string; videoUrl?: string; scheduledAt?: string; platforms?: string[] };

export async function POST(request: Request) {
  if (!request.headers.get('oai-authenticated-user-id')) return json({ error: 'Sign in to create a schedule.' }, 401);
  const body = await request.json().catch(() => null) as RequestBody | null;
  if (!body?.language || !['zu', 'en'].includes(body.language) || !body.title?.trim() || !body.videoUrl || !body.scheduledAt) return json({ error: 'Language, title, HTTPS video URL, and scheduled time are required.' }, 400);
  if (!/^https:\/\//i.test(body.videoUrl)) return json({ error: 'The video must be available at a public HTTPS URL.' }, 400);
  const platforms = (body.platforms ?? ['Facebook', 'Instagram', 'TikTok', 'YouTube']).filter(p => ['Facebook', 'Instagram', 'TikTok', 'YouTube'].includes(p));
  if (!platforms.length) return json({ error: 'Choose at least one platform.' }, 400);
  const connected = body.language === 'zu' ? {
    Facebook: Boolean(cfg.META_SYSTEM_USER_TOKEN && cfg.META_PAGE_ID),
    Instagram: Boolean(cfg.META_SYSTEM_USER_TOKEN && cfg.META_IG_USER_ID),
    TikTok: Boolean(cfg.ZERNIO_ZU_API_KEY && cfg.ZERNIO_ZU_TIKTOK_ACCOUNT_ID),
    YouTube: Boolean(cfg.ZERNIO_ZU_API_KEY && cfg.ZERNIO_ZU_YOUTUBE_ACCOUNT_ID),
  } : { Facebook: false, Instagram: false, TikTok: false, YouTube: false };
  return json({ mode: 'dry_run', willPublish: false, language: body.language, title: body.title.trim(), scheduledAt: body.scheduledAt, platforms: platforms.map(platform => ({ platform, connected: connected[platform as keyof typeof connected], status: connected[platform as keyof typeof connected] ? 'ready' : 'not_connected' })), message: 'Schedule plan validated. Publishing is disabled until explicitly enabled.' });
}

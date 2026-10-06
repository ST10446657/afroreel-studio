import { env } from 'cloudflare:workers';
import {isLanguage,languageNames,metaPrefix,zernioPrefix} from '@/lib/languages';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff' };
function json(body: unknown, status = 200) { return Response.json(body, { status, headers }); }
type Account = { _id?: string; platform?: string; username?: string; isActive?: boolean; profileId?: string | { _id?: string } };

export async function GET(request: Request) {
  // Sites dispatch authenticates visitors and enforces this Site's private access policy.
  if (!request.headers.get('oai-authenticated-user-id')) return json({ error: 'Sign in to view connections.' }, 401);
  const language = new URL(request.url).searchParams.get('language');
  if (!isLanguage(language)) return json({ error: `Choose ${Object.values(languageNames).join(', ')}.` }, 400);
  const config = env as unknown as Record<string, string | undefined>;
  const prefix = zernioPrefix(language);
  const key = config[`${prefix}_API_KEY`];
  const profileId = config[`${prefix}_PROFILE_ID`];
  const expected = [
    { platform: 'TikTok', apiPlatform: 'tiktok', id: config[`${prefix}_TIKTOK_ACCOUNT_ID`] },
    { platform: 'YouTube', apiPlatform: 'youtube', id: config[`${prefix}_YOUTUBE_ACCOUNT_ID`] },
  ];
  const meta=metaPrefix(language);
  const metaReady=Boolean((config[`${meta}_SYSTEM_USER_TOKEN`]||config.META_EN_SYSTEM_USER_TOKEN||config.META_SHARED_SYSTEM_USER_TOKEN)&&config[`${meta}_PAGE_ID`]&&config[`${meta}_IG_USER_ID`]);
  const base = [{ platform: 'Facebook', provider: 'Meta', status: metaReady?'connected':'not_connected', username: null }, { platform: 'Instagram', provider: 'Meta', status: metaReady?'connected':'not_connected', username: null }];
  if (!key || !profileId) return json({ language, checkedAt: null, accounts: [...base, ...expected.map(a => ({ platform: a.platform, provider: 'Zernio', status: 'not_connected', username: null }))] });
  try {
    const response = await fetch(`https://zernio.com/api/v1/accounts?profileId=${encodeURIComponent(profileId)}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(12000) });
    if (!response.ok) return json({ error: response.status === 401 || response.status === 403 ? 'Zernio could not authorise this connection. Check the API key permissions.' : 'Zernio is unavailable. Try checking again.' }, 502);
    const result = await response.json() as { accounts?: Account[] };
    if (!Array.isArray(result.accounts)) return json({ error: 'Zernio returned an unexpected response.' }, 502);
    const accounts = expected.map(expected => {
      const account = result.accounts!.find(a => a._id === expected.id && a.platform === expected.apiPlatform && (typeof a.profileId === 'string' ? a.profileId : a.profileId?._id) === profileId);
      return { platform: expected.platform, provider: 'Zernio', status: account ? (account.isActive ? 'connected' : 'needs_attention') : 'not_connected', username: account?.username ?? null };
    });
    return json({ language, checkedAt: new Date().toISOString(), accounts: [...base, ...accounts] });
  } catch {
    return json({ error: 'Connection check timed out or failed. Try again.' }, 502);
  }
}

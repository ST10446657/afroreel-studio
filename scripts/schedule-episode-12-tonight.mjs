#!/usr/bin/env node
import process from 'node:process';

try {
  process.loadEnvFile?.('.env.local');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const SITE_URL = process.env.AFROREEL_STUDIO_URL || 'https://afroreel-studio.mamulis101.chatgpt.site';
const SCHEDULED_AT = '2026-10-05T20:30:00+02:00';
const DRIVE_FILE_ID = '1V2Bt1Kdnz4IoR0XupHldemzx82dSxB_l';
const VIDEO_URL = `https://drive.google.com/uc?export=download&id=${DRIVE_FILE_ID}`;

const payload = {
  language: 'en',
  episode: 12,
  title: 'She Grew Up a Servant in Her Own Home · Episode 12',
  caption: `The lawyer confirms it: Baba left EVERYTHING to Amina. The company. The estate. All of it. 😳

But Amina hasn’t won yet.

In TWO DAYS, Zara takes control… and once she does, the truth may not be enough.

🎬 She Grew Up a Servant in Her Own Home.
Watch the full series for FREE, link in bio.

#africanstories #africanstorytime #africantiktok #mzanzidrama #nollywood #naijatiktok #nigeriantiktok #nollywooddrama #asabamovies #kenyanseries #swahilidrama #mzansitiktok #mzansisoapiesdailyupdate`,
  videoUrl: VIDEO_URL,
  scheduledAt: SCHEDULED_AT,
  platforms: ['Facebook', 'Instagram', 'TikTok', 'YouTube'],
};

console.log('AfroReel English scheduling plan:');
console.log(`- Episode 12: ${SCHEDULED_AT} → ${payload.platforms.join(', ')}`);

if (new Date(SCHEDULED_AT).getTime() <= Date.now() + 60_000) {
  throw new Error('Tonight’s 20:30 schedule time has passed or is less than one minute away.');
}

const mediaResponse = await fetch(VIDEO_URL, {
  headers: {Range: 'bytes=0-1023'},
  redirect: 'follow',
});
const mediaType = mediaResponse.headers.get('content-type') || '';
const mediaValid = [200, 206].includes(mediaResponse.status) && /video|octet-stream/i.test(mediaType);
await mediaResponse.body?.cancel();
if (!mediaValid) {
  throw new Error(
    `Episode 12 is not publicly downloadable (${mediaResponse.status}, ${mediaType || 'unknown content type'}). ` +
    'Set the Drive file to General access: Anyone with the link, then run this script again.',
  );
}
console.log('✓ Episode 12 media is publicly downloadable.');

if (!process.argv.includes('--confirm')) {
  console.log('\nDry run passed. Nothing was scheduled. Add --confirm to create the schedule.');
  process.exit(0);
}

const automationKey = process.env.STUDIO_AUTOMATION_KEY;
const bypassToken = process.env.SITES_BYPASS_TOKEN;
if (!automationKey) throw new Error('STUDIO_AUTOMATION_KEY is missing from .env.local or the environment.');
if (!bypassToken) throw new Error('SITES_BYPASS_TOKEN is missing from .env.local or the environment.');

const response = await fetch(`${SITE_URL}/api/automation/schedule`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': automationKey,
    'OAI-Sites-Authorization': `Bearer ${bypassToken}`,
  },
  body: JSON.stringify(payload),
});
const result = await response.json().catch(() => ({}));
if (!response.ok) {
  throw new Error(result.error || `Scheduling failed with HTTP ${response.status}.`);
}

console.log(`\n✓ Episode 12 ${result.created ? 'scheduled' : 'was already scheduled'}.`);
console.log(`ID: ${result.id}`);
console.log(`Status: ${result.status}`);
console.log(`Scheduled for: ${result.scheduledAt}`);

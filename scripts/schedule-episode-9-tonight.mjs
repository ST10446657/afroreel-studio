#!/usr/bin/env node
import process from 'node:process';

const CONFIRM_FLAG = '--confirm';
const SITE_URL = process.env.AFROREEL_STUDIO_URL || 'https://afroreel-studio.mamulis101.chatgpt.site';
const SCHEDULED_AT = '2026-10-01T20:30:00+02:00';
const DRIVE_FILE_ID = '1lP16GqwMj5QwaD1x1mG18RRJvJXQ80OZ';
const VIDEO_URL = `https://drive.google.com/uc?export=download&id=${DRIVE_FILE_ID}`;

const payload = {
  language: 'en',
  episode: 9,
  title: 'She Grew Up a Servant in Her Own Home · Episode 9',
  caption: `Amina finally walks into Zara’s office with proof that EVERYTHING belongs to her. 😳

But Zara isn’t scared. 😳

🎬 She Grew Up a Servant in Her Own Home.
Watch the full series for FREE, link in bio.

#africanstories #africanstorytime #africantiktok #mzanzidrama #nollywood #naijatiktok #nigeriantiktok #nollywooddrama #asabamovies #kenyanseries #swahilidrama #mzansitiktok #mzansisoapiesdailyupdate`,
  videoUrl: VIDEO_URL,
  scheduledAt: SCHEDULED_AT,
  platforms: ['Facebook', 'Instagram', 'TikTok', 'YouTube'],
};

console.log(JSON.stringify(payload, null, 2));

if (!process.argv.includes(CONFIRM_FLAG)) {
  console.log('\nDry run only. Add --confirm to create the schedule.');
  process.exit(0);
}

if (new Date(SCHEDULED_AT).getTime() <= Date.now() + 60_000) {
  throw new Error('The 8:30 PM schedule time has passed or is less than one minute away.');
}

const automationKey = process.env.STUDIO_AUTOMATION_KEY;
const bypassToken = process.env.SITES_BYPASS_TOKEN;
if (!automationKey) throw new Error('STUDIO_AUTOMATION_KEY is missing.');
if (!bypassToken) throw new Error('SITES_BYPASS_TOKEN is missing.');

const mediaResponse = await fetch(VIDEO_URL, {
  headers: { Range: 'bytes=0-1023' },
  redirect: 'follow',
});
const mediaType = mediaResponse.headers.get('content-type') || '';
if (![200, 206].includes(mediaResponse.status) || !/video|octet-stream/i.test(mediaType)) {
  throw new Error(`Episode 9 video is not publicly downloadable (${mediaResponse.status}, ${mediaType || 'unknown content type'}).`);
}
await mediaResponse.body?.cancel();

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

console.log('\nSchedule accepted by AfroReel Studio.');
console.log(`ID: ${result.id}`);
console.log(`Created: ${result.created}`);
console.log(`Status: ${result.status}`);
console.log(`Scheduled for: ${result.scheduledAt}`);

#!/usr/bin/env node
import process from 'node:process';

try {
  process.loadEnvFile?.('.env.local');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const SITE_URL = process.env.AFROREEL_STUDIO_URL || 'https://afroreel-studio.mamulis101.chatgpt.site';
const PLATFORMS = ['Facebook', 'Instagram', 'TikTok', 'YouTube'];
const CONFIRMED = process.argv.includes('--confirm');

const episodes = [
  {
    episode: 10,
    scheduledAt: '2026-10-02T20:30:00+02:00',
    driveFileId: '1qL8jkCn7RoFwyCyYwDVdJowy61-6z0kP',
    caption: `Amina has the will. She knows the truth. But Zara has another plan. 😳

Leo warns her: “She wants you gone.”

Not out of the house.

Gone FOREVER. 🔪

🎬 She Grew Up a Servant in Her Own Home.
Watch the full series for FREE, link in bio.

#africanstories #africanstorytime #africantiktok #mzanzidrama #nollywood #naijatiktok #nigeriantiktok #nollywooddrama #asabamovies #kenyanseries #swahilidrama #mzansitiktok #mzansisoapiesdailyupdate`,
  },
  {
    episode: 11,
    scheduledAt: '2026-10-04T20:30:00+02:00',
    driveFileId: '11JkWkfYYVN05NIPv5I8c7MxtgijLImzv',
    caption: `The whole estate is locked down and the guards are getting closer. 😳

Then Leo remembers a secret passage Baba showed him years ago.

Mama T stays behind to protect them while Amina and Leo escape with the will. 💔

But when they reach Baba’s old lawyer, his reaction changes everything…

🎬 She Grew Up a Servant in Her Own Home.
Watch the full series for FREE, link in bio.

#africanstories #africanstorytime #africantiktok #mzanzidrama #nollywood #naijatiktok #nigeriantiktok #nollywooddrama #asabamovies #kenyanseries #swahilidrama #mzansitiktok #mzansisoapiesdailyupdate`,
  },
].map((item) => ({
  language: 'en',
  episode: item.episode,
  title: `She Grew Up a Servant in Her Own Home · Episode ${item.episode}`,
  caption: item.caption,
  videoUrl: `https://drive.google.com/uc?export=download&id=${item.driveFileId}`,
  scheduledAt: item.scheduledAt,
  platforms: PLATFORMS,
}));

console.log('AfroReel English scheduling plan:');
for (const item of episodes) {
  console.log(`- Episode ${item.episode}: ${item.scheduledAt} → ${item.platforms.join(', ')}`);
}

for (const item of episodes) {
  if (new Date(item.scheduledAt).getTime() <= Date.now() + 60_000) {
    throw new Error(`Episode ${item.episode}'s schedule time has passed or is less than one minute away.`);
  }
}

// Validate every source before creating either schedule. This avoids leaving a
// half-created pair when a Drive file is private or unavailable.
for (const item of episodes) {
  const response = await fetch(item.videoUrl, {
    headers: {Range: 'bytes=0-1023'},
    redirect: 'follow',
  });
  const contentType = response.headers.get('content-type') || '';
  const valid = [200, 206].includes(response.status) && /video|octet-stream/i.test(contentType);
  await response.body?.cancel();
  if (!valid) {
    throw new Error(
      `Episode ${item.episode} is not publicly downloadable (${response.status}, ${contentType || 'unknown content type'}). ` +
      'In Google Drive, set the video to General access: Anyone with the link, then run this script again.',
    );
  }
  console.log(`✓ Episode ${item.episode} media is publicly downloadable.`);
}

if (!CONFIRMED) {
  console.log('\nDry run passed. Nothing was scheduled. Add --confirm to create both schedules.');
  process.exit(0);
}

const automationKey = process.env.STUDIO_AUTOMATION_KEY;
const bypassToken = process.env.SITES_BYPASS_TOKEN;
if (!automationKey) throw new Error('STUDIO_AUTOMATION_KEY is missing from .env.local or the environment.');
if (!bypassToken) throw new Error('SITES_BYPASS_TOKEN is missing from .env.local or the environment.');

for (const item of episodes) {
  const response = await fetch(`${SITE_URL}/api/automation/schedule`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': automationKey,
      'OAI-Sites-Authorization': `Bearer ${bypassToken}`,
    },
    body: JSON.stringify(item),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Episode ${item.episode} was not scheduled: ${result.error || `HTTP ${response.status}`}`);
  }
  console.log(
    `✓ Episode ${item.episode}: ${result.created ? 'scheduled' : 'already scheduled'} ` +
    `(${result.id}, ${result.status}, ${result.scheduledAt})`,
  );
}

console.log('\nBoth episodes are queued for automatic publishing.');

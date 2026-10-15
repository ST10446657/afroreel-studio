import {access, readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';

const directory = path.resolve(process.argv[2] || '');
if (!process.argv[2]) {
  console.error('Usage: npm run production:validate -- /absolute/path/to/episode-package');
  process.exit(2);
}

const required = ['silent.mp4', 'en.wav', 'zu.wav', 'ha.wav', 'sw.wav', 'fr.wav', 'en.srt', 'fr.srt'];
const failures = [];
const durations = new Map();

for (const filename of required) {
  const file = path.join(directory, filename);
  try {
    await access(file);
  } catch {
    failures.push(`Missing ${filename}`);
    continue;
  }
  if (filename.endsWith('.mp4') || filename.endsWith('.wav')) {
    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], {encoding: 'utf8'});
    const duration = Number(probe.stdout.trim());
    if (probe.status !== 0 || !Number.isFinite(duration)) failures.push(`Unreadable media: ${filename}`);
    else durations.set(filename, duration);
  }
}

const video = path.join(directory, 'silent.mp4');
if (!failures.includes('Missing silent.mp4')) {
  const audioProbe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', video], {encoding: 'utf8'});
  if (audioProbe.stdout.trim()) failures.push('silent.mp4 still contains an audio stream');
}

const baseline = durations.get('silent.mp4');
if (baseline) {
  for (const [filename, duration] of durations) {
    if (filename !== 'silent.mp4' && Math.abs(duration - baseline) > 0.5) failures.push(`${filename} differs from the video by more than 0.5 seconds`);
  }
}

const actual = await readdir(directory).catch(() => []);
const result = {directory, required, present: required.filter(file => actual.includes(file)), durations: Object.fromEntries(durations), valid: failures.length === 0, failures};
console.log(JSON.stringify(result, null, 2));
process.exit(failures.length ? 1 : 0);

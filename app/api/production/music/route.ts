import {env} from 'cloudflare:workers';
import {authenticatedUser} from '@/lib/auth';

export const dynamic='force-dynamic';
type Statement={bind:(...values:unknown[])=>Statement;first:()=>Promise<Record<string,unknown>|null>};
type D1={prepare:(sql:string)=>Statement};
type Project={project_id:string;reference?:string;media?:{filename?:string}};
type Segment={text?:string;start_s?:number;end_s?:number};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
const key=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]/g,'');
const stamp=(seconds:number)=>`${Math.floor(seconds/60)}:${String(Math.round(seconds%60)).padStart(2,'0')}`;

function findTime(segments:Segment[],phrase:string,fallback:number){
 const match=segments.find(segment=>String(segment.text??'').toLowerCase().includes(phrase));
 return Number(match?.start_s??fallback);
}

function promptForEpisodeSix(segments:Segment[],duration:number){
 const recognition=findTime(segments,'remember me',8),memory=findTime(segments,'one shoe',15),question=findTime(segments,"didn't you come back",29),years=findTime(segments,'fifteen years',36),reason=findTime(segments,"reason i couldn't",48),reveal=findTime(segments,"hasn't told you everything",56);
 return `USE CASE
Instrumental cinematic underscore for a ${duration.toFixed(0)}-second vertical family micro-drama. An estranged father and teenage son meet after fifteen years. The scene moves from wary recognition and an intimate childhood memory into confrontation, withheld truth and a final revelation. Dialogue is continuous and must stay fully intelligible.

GENRE & STYLE
Modern intimate dramatic suspense, restrained and emotionally precise. Use a short questioning motif, subtle pulse and evolving harmonic tension. The dramatic engine is confrontation and mystery, not grief or nostalgia.

MOOD
Begin guarded and curious. Briefly soften for the childhood memory without becoming sentimental. Build disbelief and controlled anger as the son demands answers. Turn increasingly uncertain when the father hints at a hidden reason. Finish with a sharp unresolved sense that the son's understanding of his mother is about to change.

TEMPO & INSTRUMENTATION
Approximately 76 BPM. Muted piano or soft mallet motif in sparse single notes, close low strings, subdued synth pulse, restrained cello texture and faint tonal percussion. Keep bass controlled and percussion minimal. No vocals.

STRUCTURE
0:00-${stamp(recognition)}: Near-silence, then introduce a two-note questioning motif and low suspended texture; guarded recognition, ample negative space.
${stamp(recognition)}-${stamp(memory)}: Add a barely audible pulse while preserving uncertainty; do not resolve the harmony.
${stamp(memory)}-${stamp(question)}: Warm the voicing slightly for the childhood memory, using delicate upper texture, but retain the unresolved low note underneath.
${stamp(question)}-${stamp(years)}: Remove the warmth. Add a dry low-string pulse and firmer harmonic friction as the son confronts his father.
${stamp(years)}-${stamp(reason)}: Increase momentum subtly with shorter repeating notes; controlled disbelief rather than sadness. Keep dynamics below dialogue.
${stamp(reason)}-${stamp(reveal)}: Thin the rhythm and suspend the harmony. Introduce a quiet descending cello colour, creating focused uncertainty around the hidden reason.
${stamp(reveal)}-${stamp(duration)}: Deliver the strongest but still restrained accent at the revelation, then hold an unresolved dark chord with a faint pulse. End cleanly at ${stamp(duration)} without a fade or resolution.

MIX & PRODUCTION
Dialogue-first mix with restrained dynamics, narrow low-mid arrangement and purposeful negative space. Keep melodic notes short and sparse. Avoid accents under the middle of spoken lines. Maintain cinematic clarity at very low playback volume. Exact duration ${duration.toFixed(0)} seconds; instrumental only.

AVOID
Vocals, choir, lyrics, sad ballad writing, mournful repetitive piano chords, warm sweeping strings, heroic themes, African musical stereotypes, busy drums, trailer booms, horror stingers, comedy, romance, generic thriller ostinatos, large risers, sudden loudness, excessive reverb, sentimental resolution and fade-out.`;
}

export async function POST(request:Request){
 const owner=authenticatedUser(request);if(!owner)return json({error:'Sign in to generate episode music.'},401);
 const body=await request.json().catch(()=>({})) as {episodeId?:string;confirm?:boolean};
 if(!body.episodeId||body.confirm!==true)return json({error:'A confirmed episode is required.'},400);
 const database=(env as unknown as {DB?:D1}).DB,apiKey=(env as unknown as {ELEVENLABS_API_KEY?:string}).ELEVENLABS_API_KEY;
 if(!database||!apiKey)return json({error:'Production storage or ElevenLabs is not configured.'},503);
 const episode=await database.prepare(`SELECT * FROM production_episodes WHERE id=? AND owner_id=?`).bind(body.episodeId,owner).first();
 if(!episode)return json({error:'Production episode not found.'},404);
 if(Number(episode.episode_number)!==6)return json({error:'This first supervised generator is locked to Episode 6.'},409);
 const listResponse=await fetch('https://api.elevenlabs.io/v1/dubbing/project?page_size=100&sort_direction=DESCENDING',{headers:{'xi-api-key':apiKey}});
 const list=await listResponse.json().catch(()=>({})) as {projects?:Project[];dubbing_projects?:Project[]};
 if(!listResponse.ok)return json({error:`ElevenLabs project lookup failed (${listResponse.status}).`},502);
 const projects=list.projects??list.dubbing_projects??[],filename=String(episode.source_filename);
 const project=projects.find(item=>key(item.media?.filename??'')===key(filename))??projects.find(item=>/(episode|ep)\s*6\b/i.test(`${item.media?.filename??''} ${item.reference??''}`));
 if(!project)return json({error:'Season 2 Episode 6 was not found in ElevenLabs Dubbing.'},404);
 const transcriptResponse=await fetch(`https://api.elevenlabs.io/v1/dubbing/project/${encodeURIComponent(project.project_id)}/transcript`,{headers:{'xi-api-key':apiKey}});
 const transcript=await transcriptResponse.json().catch(()=>({})) as {segments?:Segment[]};
 if(!transcriptResponse.ok||!Array.isArray(transcript.segments))return json({error:'The Episode 6 English timestamped transcript is not ready.'},409);
 const duration=Math.round(Number(episode.duration_seconds??64)),prompt=promptForEpisodeSix(transcript.segments,duration);
 if(prompt.length>3999)return json({error:`Music prompt is ${prompt.length} characters and exceeds the AfroReel limit.`},500);
 const musicResponse=await fetch('https://api.elevenlabs.io/v1/music?output_format=mp3_48000_192',{method:'POST',headers:{'xi-api-key':apiKey,'Content-Type':'application/json'},body:JSON.stringify({prompt,music_length_ms:duration*1000,model_id:'music_v2_5',force_instrumental:true})});
 if(!musicResponse.ok){const message=await musicResponse.text().catch(()=>`HTTP ${musicResponse.status}`);return json({error:`ElevenLabs music generation failed (${musicResponse.status}).`,detail:message.slice(0,500)},502)}
 return new Response(musicResponse.body,{headers:{'Content-Type':'audio/mpeg','Content-Disposition':'attachment; filename="S2_E06_Father_and_Son_Music_2_5.mp3"','Cache-Control':'private, no-store','X-AfroReel-Prompt-Characters':String(prompt.length),'X-AfroReel-Transcript-Segments':String(transcript.segments.length),'X-AfroReel-Song-Id':musicResponse.headers.get('song-id')??''}});
}

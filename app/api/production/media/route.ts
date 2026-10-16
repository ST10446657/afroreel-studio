import {env} from 'cloudflare:workers';
import {authenticatedUser} from '@/lib/auth';

export const dynamic='force-dynamic';
type Statement={bind:(...values:unknown[])=>Statement;first:()=>Promise<Record<string,unknown>|null>};
type D1={prepare:(sql:string)=>Statement};
const database=()=>{const value=(env as unknown as {DB?:D1}).DB;if(!value)throw Error('Production storage is unavailable.');return value};
const apiKey=()=>{const value=(env as unknown as {ELEVENLABS_API_KEY?:string}).ELEVENLABS_API_KEY;if(!value)throw Error('ElevenLabs is not configured.');return value};
const fail=(message:string,status:number)=>Response.json({error:message},{status,headers:{'Cache-Control':'no-store'}});

function driveSource(episode:Record<string,unknown>){
 try{const metadata=JSON.parse(String(episode.source_metadata)) as {videoUrl?:string};const match=metadata.videoUrl?.match(/\/file\/d\/([^/?]+)/)||metadata.videoUrl?.match(/[?&]id=([^&]+)/);if(match?.[1])return `https://drive.usercontent.google.com/download?id=${encodeURIComponent(match[1])}&export=download&confirm=t`;if(metadata.videoUrl)return metadata.videoUrl}catch{}
 return `https://drive.usercontent.google.com/download?id=${encodeURIComponent(String(episode.drive_file_id))}&export=download&confirm=t`;
}

async function relay(url:string,request:Request,fallbackType:string){
 const range=request.headers.get('range');
 const upstream=await fetch(url,{headers:range?{Range:range}:{},redirect:'follow',signal:AbortSignal.timeout(120000)});
 if(!upstream.ok||!upstream.body)return fail(`Media source returned HTTP ${upstream.status}.`,502);
 const headers=new Headers({'Content-Type':upstream.headers.get('content-type')||fallbackType,'Cache-Control':'private, max-age=300','Accept-Ranges':upstream.headers.get('accept-ranges')||'bytes'});
 for(const name of ['content-length','content-range','etag','last-modified']){const value=upstream.headers.get(name);if(value)headers.set(name,value)}
 return new Response(upstream.body,{status:upstream.status,headers});
}

export async function GET(request:Request){
 const owner=authenticatedUser(request);if(!owner)return fail('Sign in to review production media.',401);
 const url=new URL(request.url),episodeId=url.searchParams.get('episodeId'),kind=url.searchParams.get('kind'),language=url.searchParams.get('language')||'zu';
 if(!episodeId||!['video','audio'].includes(kind||''))return fail('Episode and media kind are required.',400);
 const db=database(),episode=await db.prepare(`SELECT * FROM production_episodes WHERE id=? AND owner_id=?`).bind(episodeId,owner).first();
 if(!episode)return fail('Production episode not found.',404);
 if(kind==='video')return relay(driveSource(episode),request,'video/mp4');
 const job=await db.prepare(`SELECT project_id,language_id FROM production_dubbing_jobs WHERE owner_id=? AND episode_id=? AND language=?`).bind(owner,episodeId,language).first();
 if(!job?.project_id||!job.language_id)return fail('Completed dubbed audio was not found.',404);
 const response=await fetch(`https://api.elevenlabs.io/v1/dubbing/project/${encodeURIComponent(String(job.project_id))}/language/${encodeURIComponent(String(job.language_id))}`,{headers:{'xi-api-key':apiKey()}});
 const data=await response.json().catch(()=>({})) as {status?:string;outputs?:{lossless_audio?:string}};
 if(!response.ok||!['completed','dubbed'].includes(data.status||'')||!data.outputs?.lossless_audio)return fail('Dubbed audio is not ready.',409);
 return relay(data.outputs.lossless_audio,request,'audio/flac');
}

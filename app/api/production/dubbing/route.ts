import {env} from 'cloudflare:workers';
import {authenticatedUser} from '@/lib/auth';

export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers});
type Statement={bind:(...values:unknown[])=>Statement;first:()=>Promise<Record<string,unknown>|null>;run:()=>Promise<unknown>};
type D1={prepare:(sql:string)=>Statement};
const database=()=>{const value=(env as unknown as {DB?:D1}).DB;if(!value)throw Error('Production storage is unavailable.');return value};

async function ensureTable(db:D1){await db.prepare(`CREATE TABLE IF NOT EXISTS production_dubbing_jobs (
 id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, episode_id TEXT NOT NULL, episode_number INTEGER NOT NULL,
 language TEXT NOT NULL, cloning_strength INTEGER NOT NULL, project_id TEXT, language_id TEXT, status TEXT NOT NULL,
 error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 UNIQUE(owner_id,episode_id,language)
)`).run()}

export async function GET(request:Request){
 const owner=authenticatedUser(request);if(!owner)return json({error:'Sign in to check the dubbing pilot.'},401);
 const episodeId=new URL(request.url).searchParams.get('episodeId');if(!episodeId)return json({error:'Episode is required.'},400);
 const key=(env as unknown as {ELEVENLABS_API_KEY?:string}).ELEVENLABS_API_KEY;if(!key)return json({error:'ElevenLabs is not configured.'},503);
 const db=database();await ensureTable(db);
 const job=await db.prepare(`SELECT * FROM production_dubbing_jobs WHERE owner_id=? AND episode_id=? AND language='zu'`).bind(owner,episodeId).first();
 if(!job)return json({job:null});
 let status=String(job.status),error=job.error?String(job.error):null,sourceTranscript:null|{text:string;segments:number;containsExpectedNames:boolean;unexpectedName:string|null}=null;
 if(job.project_id&&job.language_id){
  const response=await fetch(`https://api.elevenlabs.io/v1/dubbing/project/${encodeURIComponent(String(job.project_id))}/language/${encodeURIComponent(String(job.language_id))}`,{headers:{'xi-api-key':key}});
  const data=await response.json().catch(()=>({})) as {status?:string;error?:{message?:string}|string};
  if(response.ok&&data.status){status=data.status;error=typeof data.error==='string'?data.error:data.error?.message??null;await db.prepare(`UPDATE production_dubbing_jobs SET status=?,error=?,updated_at=? WHERE id=?`).bind(status,error,Date.now(),String(job.id)).run()}
  const transcriptResponse=await fetch(`https://api.elevenlabs.io/v1/dubbing/project/${encodeURIComponent(String(job.project_id))}/transcript`,{headers:{'xi-api-key':key}});
  const transcript=await transcriptResponse.json().catch(()=>({})) as {segments?:Array<{text?:string}>};
  if(transcriptResponse.ok&&Array.isArray(transcript.segments)){const text=transcript.segments.map(segment=>segment.text??'').join(' ');sourceTranscript={text,segments:transcript.segments.length,containsExpectedNames:/\bKhwezi\b/i.test(text),unexpectedName:/\bQuasie\b/i.test(text)?'Quasie':null}}
 }
 return json({job:{id:String(job.id),status,projectId:job.project_id?String(job.project_id):null,languageId:job.language_id?String(job.language_id):null,language:'zu',cloningStrength:0,error},sourceTranscript});
}

export async function POST(request:Request){
 const owner=authenticatedUser(request);if(!owner)return json({error:'Sign in to start a dubbing pilot.'},401);
 const body=await request.json().catch(()=>null) as {episodeId?:string;confirm?:boolean}|null;
 if(!body?.episodeId||body.confirm!==true)return json({error:'Explicit confirmation is required.'},400);
 const key=(env as unknown as {ELEVENLABS_API_KEY?:string}).ELEVENLABS_API_KEY;
 if(!key)return json({error:'ElevenLabs is not configured.'},503);
 const db=database();await ensureTable(db);
 const episode=await db.prepare(`SELECT * FROM production_episodes WHERE id=? AND owner_id=?`).bind(body.episodeId,owner).first();
 if(!episode)return json({error:'Production episode not found.'},404);
 if(Number(episode.episode_number)!==6)return json({error:'Only the approved Episode 6 pilot can be started.'},409);
 const existing=await db.prepare(`SELECT * FROM production_dubbing_jobs WHERE owner_id=? AND episode_id=? AND language='zu'`).bind(owner,body.episodeId).first();
 if(existing)return json({job:{id:String(existing.id),status:String(existing.status),projectId:existing.project_id?String(existing.project_id):null,languageId:existing.language_id?String(existing.language_id):null},duplicatePrevented:true});
 const id=crypto.randomUUID(),now=Date.now();
 await db.prepare(`INSERT INTO production_dubbing_jobs (id,owner_id,episode_id,episode_number,language,cloning_strength,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`).bind(id,owner,body.episodeId,6,'zu',0,'creating_project',now,now).run();
 try{
  const form=new FormData();
  form.set('source_url',`https://drive.usercontent.google.com/download?id=${encodeURIComponent(String(episode.drive_file_id))}&export=download&confirm=t`);
  form.set('reference','AfroReel Series 2 Episode 6 Zulu pilot');form.set('source_language','en');form.set('model_id','dubbing_v2');
  form.append('keyterms','Khwezi');form.append('keyterms','Dumi');
  const projectResponse=await fetch('https://api.elevenlabs.io/v1/dubbing/project',{method:'POST',headers:{'xi-api-key':key},body:form});
  const projectData=await projectResponse.json().catch(()=>({})) as {project_id?:string;status?:string;detail?:unknown};
  if(!projectResponse.ok||!projectData.project_id)throw Error(`Project creation failed (${projectResponse.status}).`);
  await db.prepare(`UPDATE production_dubbing_jobs SET project_id=?,status='project_created',updated_at=? WHERE id=?`).bind(projectData.project_id,Date.now(),id).run();
  const targetResponse=await fetch(`https://api.elevenlabs.io/v1/dubbing/project/${encodeURIComponent(projectData.project_id)}/language`,{method:'POST',headers:{'xi-api-key':key,'Content-Type':'application/json'},body:JSON.stringify({target_language:'zu',voice_settings:{cloning_strength:0}})});
  const targetData=await targetResponse.json().catch(()=>({})) as {language_id?:string;status?:string};
  if(!targetResponse.ok||!targetData.language_id)throw Error(`Zulu target creation failed (${targetResponse.status}).`);
  await db.prepare(`UPDATE production_dubbing_jobs SET language_id=?,status=?,updated_at=? WHERE id=?`).bind(targetData.language_id,targetData.status??'queued',Date.now(),id).run();
  return json({job:{id,status:targetData.status??'queued',projectId:projectData.project_id,languageId:targetData.language_id,language:'zu',cloningStrength:0},duplicatePrevented:false},201);
 }catch(error){const message=error instanceof Error?error.message:'Zulu pilot could not be created.';await db.prepare(`UPDATE production_dubbing_jobs SET status='failed',error=?,updated_at=? WHERE id=?`).bind(message,Date.now(),id).run();return json({error:message,jobId:id},502)}
}

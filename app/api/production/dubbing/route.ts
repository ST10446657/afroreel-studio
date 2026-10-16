import {env} from 'cloudflare:workers';
import {authenticatedUser} from '@/lib/auth';

export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers});
type Statement={bind:(...values:unknown[])=>Statement;first:()=>Promise<Record<string,unknown>|null>;run:()=>Promise<unknown>};
type D1={prepare:(sql:string)=>Statement};
type Language='zu'|'ha'|'sw'|'fr';
const languages:Record<Language,{name:string;strength:number}>={zu:{name:'Zulu',strength:0},ha:{name:'Hausa',strength:0},sw:{name:'Swahili',strength:0},fr:{name:'French',strength:5}};
const database=()=>{const value=(env as unknown as {DB?:D1}).DB;if(!value)throw Error('Production storage is unavailable.');return value};
const apiKey=()=>{const value=(env as unknown as {ELEVENLABS_API_KEY?:string}).ELEVENLABS_API_KEY;if(!value)throw Error('ElevenLabs is not configured.');return value};

async function ensureTable(db:D1){await db.prepare(`CREATE TABLE IF NOT EXISTS production_dubbing_jobs (
 id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, episode_id TEXT NOT NULL, episode_number INTEGER NOT NULL,
 language TEXT NOT NULL, cloning_strength INTEGER NOT NULL, project_id TEXT, language_id TEXT, status TEXT NOT NULL,
 error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 UNIQUE(owner_id,episode_id,language)
)`).run()}
const directSource=(episode:Record<string,unknown>)=>{try{const metadata=JSON.parse(String(episode.source_metadata)) as {videoUrl?:string};if(metadata.videoUrl)return metadata.videoUrl}catch{}return `https://drive.usercontent.google.com/download?id=${encodeURIComponent(String(episode.drive_file_id))}&export=download&confirm=t`};
const stages=(episode:Record<string,unknown>)=>{try{return JSON.parse(String(episode.stages)) as Array<{key:string;status:string}>}catch{return []}};

export async function GET(request:Request){
 const owner=authenticatedUser(request);if(!owner)return json({error:'Sign in to check dubbing.'},401);
 const url=new URL(request.url),episodeId=url.searchParams.get('episodeId'),language=(url.searchParams.get('language')||'zu') as Language;
 if(!episodeId||!languages[language])return json({error:'A valid episode and language are required.'},400);
 const key=apiKey(),db=database();await ensureTable(db);
 const job=await db.prepare(`SELECT * FROM production_dubbing_jobs WHERE owner_id=? AND episode_id=? AND language=?`).bind(owner,episodeId,language).first();
 if(!job)return json({job:null});
 let status=String(job.status),error=job.error?String(job.error):null,outputUrl:string|null=null,sourceTranscript:null|{text:string;segments:number;containsExpectedNames:boolean;unexpectedName:string|null}=null;
 if(job.project_id&&job.language_id){
  const response=await fetch(`https://api.elevenlabs.io/v1/dubbing/project/${encodeURIComponent(String(job.project_id))}/language/${encodeURIComponent(String(job.language_id))}`,{headers:{'xi-api-key':key}});
  const data=await response.json().catch(()=>({})) as {status?:string;error?:{message?:string}|string;outputs?:{lossless_audio?:string}};
  if(response.ok&&data.status){status=data.status;error=typeof data.error==='string'?data.error:data.error?.message??null;outputUrl=data.outputs?.lossless_audio??null;await db.prepare(`UPDATE production_dubbing_jobs SET status=?,error=?,updated_at=? WHERE id=?`).bind(status,error,Date.now(),String(job.id)).run()}
 }
 if(job.project_id){
  const transcriptResponse=await fetch(`https://api.elevenlabs.io/v1/dubbing/project/${encodeURIComponent(String(job.project_id))}/transcript`,{headers:{'xi-api-key':key}});
  const transcript=await transcriptResponse.json().catch(()=>({})) as {segments?:Array<{text?:string}>};
  if(transcriptResponse.ok&&Array.isArray(transcript.segments)){const text=transcript.segments.map(segment=>segment.text??'').join(' ');sourceTranscript={text,segments:transcript.segments.length,containsExpectedNames:/\bKhwezi\b/i.test(text),unexpectedName:/\bQuasie\b/i.test(text)?'Quasie':null}}
 }
 return json({job:{id:String(job.id),status,projectId:job.project_id?String(job.project_id):null,languageId:job.language_id?String(job.language_id):null,language,cloningStrength:languages[language].strength,error,outputUrl},sourceTranscript});
}

export async function POST(request:Request){
 const owner=authenticatedUser(request);if(!owner)return json({error:'Sign in to start dubbing.'},401);
 const body=await request.json().catch(()=>null) as {episodeId?:string;language?:Language;confirm?:boolean}|null;
 const language=body?.language??'zu',configuration=languages[language];
 if(!body?.episodeId||body.confirm!==true||!configuration)return json({error:'Episode, language and explicit confirmation are required.'},400);
 const key=apiKey(),db=database();await ensureTable(db);
 const episode=await db.prepare(`SELECT * FROM production_episodes WHERE id=? AND owner_id=?`).bind(body.episodeId,owner).first();if(!episode)return json({error:'Production episode not found.'},404);
 const existing=await db.prepare(`SELECT * FROM production_dubbing_jobs WHERE owner_id=? AND episode_id=? AND language=?`).bind(owner,body.episodeId,language).first();
 if(existing)return json({job:{id:String(existing.id),status:String(existing.status),projectId:existing.project_id?String(existing.project_id):null,languageId:existing.language_id?String(existing.language_id):null,language,cloningStrength:configuration.strength},duplicatePrevented:true});
 const id=crypto.randomUUID(),now=Date.now();let projectId:string|null=null;
 await db.prepare(`INSERT INTO production_dubbing_jobs (id,owner_id,episode_id,episode_number,language,cloning_strength,project_id,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(id,owner,body.episodeId,Number(episode.episode_number),language,configuration.strength,null,language==='zu'?'creating_project':'checking_gate',now,now).run();
 if(language==='zu'){
  const form=new FormData();form.set('source_url',directSource(episode));form.set('reference',`AfroReel ${String(episode.series)} Episode ${Number(episode.episode_number)} Zulu pilot`);form.set('source_language','en');form.set('model_id','dubbing_v2');
  try{const metadata=JSON.parse(String(episode.source_metadata)) as {scriptText?:string};const names=[...new Set((metadata.scriptText?.match(/\b[A-Z][A-Z]+\b/g)??[]).filter(name=>name.length>2))].slice(0,20);for(const name of names)form.append('keyterms',name[0]+name.slice(1).toLowerCase())}catch{}
  const response=await fetch('https://api.elevenlabs.io/v1/dubbing/project',{method:'POST',headers:{'xi-api-key':key},body:form});const data=await response.json().catch(()=>({})) as {project_id?:string};if(!response.ok||!data.project_id){await db.prepare(`UPDATE production_dubbing_jobs SET status='failed',error=?,updated_at=? WHERE id=?`).bind(`Project creation failed (${response.status}).`,Date.now(),id).run();return json({error:`Project creation failed (${response.status}).`,jobId:id},502)}projectId=data.project_id;
 }else{
  const pilot=await db.prepare(`SELECT project_id,status FROM production_dubbing_jobs WHERE owner_id=? AND episode_id=? AND language='zu'`).bind(owner,body.episodeId).first();if(!pilot?.project_id){await db.prepare(`DELETE FROM production_dubbing_jobs WHERE id=?`).bind(id).run();return json({error:'Complete the Zulu pilot first.'},409)}
  const approved=stages(episode).find(stage=>stage.key==='zulu')?.status==='approved';if(!approved){await db.prepare(`DELETE FROM production_dubbing_jobs WHERE id=?`).bind(id).run();return json({error:'Approve the Zulu review before generating the remaining languages.'},409)}projectId=String(pilot.project_id);
 }
 await db.prepare(`UPDATE production_dubbing_jobs SET project_id=?,status='creating_language',updated_at=? WHERE id=?`).bind(projectId,Date.now(),id).run();
 try{const response=await fetch(`https://api.elevenlabs.io/v1/dubbing/project/${encodeURIComponent(projectId)}/language`,{method:'POST',headers:{'xi-api-key':key,'Content-Type':'application/json'},body:JSON.stringify({target_language:language,voice_settings:{cloning_strength:configuration.strength}})});const data=await response.json().catch(()=>({})) as {language_id?:string;status?:string};if(!response.ok||!data.language_id)throw Error(`${configuration.name} target creation failed (${response.status}).`);await db.prepare(`UPDATE production_dubbing_jobs SET language_id=?,status=?,updated_at=? WHERE id=?`).bind(data.language_id,data.status??'queued',Date.now(),id).run();return json({job:{id,status:data.status??'queued',projectId,languageId:data.language_id,language,cloningStrength:configuration.strength},duplicatePrevented:false},201)}catch(error){const message=error instanceof Error?error.message:`${configuration.name} could not be created.`;await db.prepare(`UPDATE production_dubbing_jobs SET status='failed',error=?,updated_at=? WHERE id=?`).bind(message,Date.now(),id).run();return json({error:message,jobId:id},502)}
}

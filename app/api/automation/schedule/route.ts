import {env} from 'cloudflare:workers';
import type {D1Database} from '@cloudflare/workers-types';
import {isLanguage,type Language} from '@/lib/languages';

export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers});
const allowed=['Instagram','TikTok','Facebook','YouTube'] as const;
type Platform=typeof allowed[number];
type Body={language?:Language;episode?:number;title?:string;caption?:string;videoUrl?:string;scheduledAt?:string;platforms?:Platform[]};
const db=()=>{const value=(env as unknown as {DB?:D1Database}).DB;if(!value)throw Error('Schedule storage is unavailable.');return value};

async function digest(value:string){return new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))}
async function authorized(request:Request,key:string){
 const supplied=request.headers.get('x-api-key')??'';if(!supplied||supplied.length!==key.length)return false;
 const [a,b]=await Promise.all([digest(supplied),digest(key)]);let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0;
}
async function stableId(body:Required<Pick<Body,'language'|'episode'|'scheduledAt'>> & {platforms:Platform[]}){
 const bytes=await digest(`${body.language}|${body.episode}|${body.scheduledAt}|${body.platforms.slice().sort().join(',')}`);
 return `episode-${body.episode}-${body.language}-${Array.from(bytes.slice(0,12),x=>x.toString(16).padStart(2,'0')).join('')}`;
}

export async function POST(request:Request){
 const cfg=env as unknown as Record<string,string|undefined>;const key=cfg.STUDIO_AUTOMATION_KEY;
 if(!key||!(await authorized(request,key)))return json({error:'Unauthorized.'},401);
 const body=await request.json().catch(()=>null) as Body|null;
 const platforms=[...new Set((body?.platforms??[]).filter((p):p is Platform=>allowed.includes(p)))];
 if(!isLanguage(body?.language)||!Number.isInteger(body.episode)||Number(body.episode)<1||!body.title?.trim()||!body.caption?.trim()||!body.videoUrl||!/^https:\/\//i.test(body.videoUrl)||!body.scheduledAt||!platforms.length)return json({error:'Language, episode, title, caption, public HTTPS video URL, schedule and platforms are required.'},400);
 const when=new Date(body.scheduledAt);if(!Number.isFinite(when.getTime())||when.getTime()<=Date.now()+60000)return json({error:'Choose a valid time at least one minute in the future.'},400);
 const id=await stableId({language:body.language,episode:Number(body.episode),scheduledAt:body.scheduledAt,platforms});
 const database=db();const existing=await database.prepare('SELECT id,status,scheduled_at AS scheduledAt FROM posts WHERE id=?').bind(id).first();
 if(existing)return json({id,created:false,status:existing.status,scheduledAt:existing.scheduledAt,message:'This schedule already exists.'});
 const now=Date.now();await database.batch([
  database.prepare(`INSERT INTO posts (id,owner_id,language,title,caption,video_url,scheduled_at,timezone,status,created_at,updated_at) VALUES (?,'automation',?,?,?,?,?,'Africa/Johannesburg','queued',?,?)`).bind(id,body.language,body.title.trim(),body.caption.trim(),body.videoUrl.trim(),body.scheduledAt,now,now),
  ...platforms.map(platform=>database.prepare(`INSERT INTO post_targets (post_id,platform,status,updated_at) VALUES (?,?,'queued',?)`).bind(id,platform,now)),
 ]);
 return json({id,created:true,status:'queued',scheduledAt:body.scheduledAt,platforms,message:'Post queued for automatic publishing.'},201);
}

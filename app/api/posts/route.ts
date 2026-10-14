import {env} from 'cloudflare:workers';
import {isLanguage,type Language} from '@/lib/languages';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers});
const allowed=['Instagram','TikTok','Facebook','YouTube'] as const;
type Platform=typeof allowed[number];
type Body={id?:string;language?:Language;title?:string;caption?:string;captions?:Partial<Record<Platform,string>>;youtubeTitle?:string;videoUrl?:string|null;scheduledAt?:string;platforms?:Platform[];status?:'draft'|'ready'|'paused'};
type D1Result={results?:Record<string,unknown>[]};
type D1Statement={
 bind:(...values:unknown[])=>D1Statement;
 all:()=>Promise<D1Result>;
 first:()=>Promise<Record<string,unknown>|null>;
 run:()=>Promise<unknown>;
};
type D1={prepare:(sql:string)=>D1Statement;batch:(statements:D1Statement[])=>Promise<unknown>};
const db=()=>{const value=(env as unknown as {DB?:D1}).DB;if(!value)throw Error('Draft storage is unavailable.');return value};
const user=(request:Request)=>request.headers.get('oai-authenticated-user-id');
const validUrl=(value:string|null|undefined)=>!value||/^https:\/\//i.test(value);
const encodeCopy=(body:Body)=>body.captions?JSON.stringify({version:1,captions:Object.fromEntries(allowed.map(platform=>[platform,body.captions?.[platform]?.trim()??''])),youtubeTitle:body.youtubeTitle?.trim()??''}):body.caption?.trim()??'';
function decodeCopy(value:unknown){
 const caption=typeof value==='string'?value:'';
 try{const parsed=JSON.parse(caption) as {version?:number;captions?:Partial<Record<Platform,string>>;youtubeTitle?:string};if(parsed.version===1)return {caption:Object.values(parsed.captions??{}).find(Boolean)??'',captions:parsed.captions??{},youtubeTitle:parsed.youtubeTitle??''}}catch{}
 return {caption,captions:Object.fromEntries(allowed.map(platform=>[platform,caption])),youtubeTitle:''};
}

export async function GET(request:Request){
 const owner=user(request);if(!owner)return json({error:'Sign in to view scheduled posts.'},401);
 try{
  const rows=await db().prepare(`SELECT p.id,p.language,p.title,p.caption,p.video_url AS videoUrl,p.scheduled_at AS scheduledAt,p.timezone,p.status,p.created_at AS createdAt,p.updated_at AS updatedAt,t.platform,t.status AS targetStatus,t.external_id AS externalId,t.error FROM posts p JOIN post_targets t ON t.post_id=p.id ORDER BY p.scheduled_at ASC,t.platform ASC`).all() as {results?:Record<string,unknown>[]};
  const posts=new Map<string,Record<string,unknown>&{targets:{platform:unknown;status:unknown;externalId:unknown;error:unknown}[]}>();
  for(const row of rows.results??[]){const id=String(row.id);if(!posts.has(id))posts.set(id,{id,language:row.language,title:row.title,...decodeCopy(row.caption),videoUrl:row.videoUrl,scheduledAt:row.scheduledAt,timezone:row.timezone,status:row.status,createdAt:row.createdAt,updatedAt:row.updatedAt,targets:[]});posts.get(id)!.targets.push({platform:row.platform,status:row.targetStatus,externalId:row.externalId,error:row.error});}
  const result=[...posts.values()].map(post=>{
   const targets=post.targets as {status:unknown}[];
   const statuses=targets.map(target=>String(target.status));
   const published=statuses.filter(status=>status==='published').length;
   const derived=published&&published<statuses.length?'partially_published':published===statuses.length?'published':statuses.includes('publishing')?'publishing':statuses.includes('queued')?'queued':statuses.every(status=>status==='failed')?'failed':post.status;
   return {...post,status:derived};
  });
  return json({posts:result});
 }catch{return json({error:'Scheduled posts could not be loaded.'},503);}
}

export async function POST(request:Request){
 const owner=user(request);if(!owner)return json({error:'Sign in to save posts.'},401);
 const body=await request.json().catch(()=>null) as Body|null;
 const platforms=[...new Set((body?.platforms??[]).filter((p):p is Platform=>allowed.includes(p)))];
 if(!isLanguage(body?.language)||!body.title?.trim()||!body.scheduledAt||!platforms.length)return json({error:'Title, schedule, language and at least one platform are required.'},400);
 if(!validUrl(body.videoUrl))return json({error:'The video must use a public HTTPS URL.'},400);
 const id=crypto.randomUUID(),now=Date.now(),status=body.status==='ready'&&body.videoUrl?'ready':'draft';
 try{
  const database=db();await database.batch([database.prepare(`INSERT INTO posts (id,owner_id,language,title,caption,video_url,scheduled_at,timezone,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(id,owner,body.language,body.title.trim(),encodeCopy(body),body.videoUrl?.trim()||null,body.scheduledAt,'Africa/Johannesburg',status,now,now),...platforms.map(platform=>database.prepare(`INSERT INTO post_targets (post_id,platform,status,updated_at) VALUES (?,?,?,?)`).bind(id,platform,status,now))]);
  return json({id,status,message:'Post saved. Nothing was published.'},201);
 }catch{return json({error:'The post could not be saved.'},503);}
}

export async function PATCH(request:Request){
 const owner=user(request);if(!owner)return json({error:'Sign in to update posts.'},401);
 const body=await request.json().catch(()=>null) as Body|null;
 const platforms=[...new Set((body?.platforms??[]).filter((p):p is Platform=>allowed.includes(p)))];
 if(!body?.id||!isLanguage(body.language)||!body.title?.trim()||!body.scheduledAt||!platforms.length)return json({error:'Post id, title, schedule, language and platforms are required.'},400);
 if(!validUrl(body.videoUrl))return json({error:'The video must use a public HTTPS URL.'},400);
  const now=Date.now(),status=body.status==='ready'&&body.videoUrl?'ready':body.status==='paused'?'paused':'draft';
 try{
  const database=db();const owned=await database.prepare(`SELECT id,status FROM posts WHERE id=?`).bind(body.id).first() as {id?:string;status?:string}|null;if(!owned)return json({error:'Post not found.'},404);if(owned.status==='published'||owned.status==='publishing')return json({error:'Published posts cannot be edited.'},409);
  const targetStatus=status==='paused'?'draft':status;
  const placeholders=platforms.map(()=>'?').join(',');
  await database.batch([
   database.prepare(`UPDATE posts SET language=?,title=?,caption=?,video_url=?,scheduled_at=?,status=?,updated_at=? WHERE id=?`).bind(body.language,body.title.trim(),encodeCopy(body),body.videoUrl?.trim()||null,body.scheduledAt,status,now,body.id),
   database.prepare(`DELETE FROM post_targets WHERE post_id=? AND status NOT IN ('published','publishing') AND platform NOT IN (${placeholders})`).bind(body.id,...platforms),
   ...platforms.map(platform=>database.prepare(`INSERT INTO post_targets (post_id,platform,status,external_id,error,updated_at) VALUES (?,?,?,NULL,NULL,?)
    ON CONFLICT(post_id,platform) DO UPDATE SET
     status=CASE WHEN post_targets.status IN ('published','publishing') THEN post_targets.status ELSE excluded.status END,
     external_id=CASE WHEN post_targets.status IN ('published','publishing') THEN post_targets.external_id ELSE NULL END,
     error=CASE WHEN post_targets.status IN ('published','publishing') THEN post_targets.error ELSE NULL END,
     updated_at=excluded.updated_at`).bind(body.id,platform,targetStatus,now))
  ]);
  return json({id:body.id,status,message:'Post updated. Nothing was published.'});
 }catch{return json({error:'The post could not be updated.'},503);}
}

export async function DELETE(request:Request){
 const owner=user(request);if(!owner)return json({error:'Sign in to delete posts.'},401);
 const id=new URL(request.url).searchParams.get('id');if(!id)return json({error:'Post id is required.'},400);
 try{const owned=await db().prepare(`SELECT p.status,(SELECT COUNT(*) FROM post_targets t WHERE t.post_id=p.id AND t.status IN ('published','publishing')) AS lockedTargets FROM posts p WHERE p.id=? AND p.owner_id IN (?, 'automation')`).bind(id,owner).first() as {status?:string;lockedTargets?:number}|null;if(!owned)return json({error:'Post not found.'},404);if(owned.status==='published'||owned.status==='publishing'||Number(owned.lockedTargets))return json({error:'Posts with published targets cannot be deleted from the schedule.'},409);await db().prepare(`DELETE FROM posts WHERE id=? AND owner_id IN (?, 'automation')`).bind(id,owner).run();return json({deleted:true});}catch{return json({error:'The post could not be deleted.'},503);}
}

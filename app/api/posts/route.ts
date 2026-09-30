import {env} from 'cloudflare:workers';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers});
const allowed=['Instagram','TikTok','Facebook','YouTube'] as const;
type Platform=typeof allowed[number];
type Body={id?:string;language?:'zu'|'en';title?:string;caption?:string;videoUrl?:string|null;scheduledAt?:string;platforms?:Platform[];status?:'draft'|'ready'|'paused'};
type D1={prepare:(sql:string)=>{bind:(...values:unknown[])=>any};batch:(statements:any[])=>Promise<unknown>};
const db=()=>{const value=(env as unknown as {DB?:D1}).DB;if(!value)throw Error('Draft storage is unavailable.');return value};
const user=(request:Request)=>request.headers.get('oai-authenticated-user-id');
const validUrl=(value:string|null|undefined)=>!value||/^https:\/\//i.test(value);

export async function GET(request:Request){
 const owner=user(request);if(!owner)return json({error:'Sign in to view scheduled posts.'},401);
 try{
  const rows=await db().prepare(`SELECT p.id,p.language,p.title,p.caption,p.video_url AS videoUrl,p.scheduled_at AS scheduledAt,p.timezone,p.status,p.created_at AS createdAt,p.updated_at AS updatedAt,t.platform,t.status AS targetStatus,t.external_id AS externalId,t.error FROM posts p JOIN post_targets t ON t.post_id=p.id ORDER BY p.scheduled_at ASC,t.platform ASC`).all() as {results?:Record<string,unknown>[]};
  const posts=new Map<string,Record<string,unknown>&{targets:{platform:unknown;status:unknown;externalId:unknown;error:unknown}[]}>();
  for(const row of rows.results??[]){const id=String(row.id);if(!posts.has(id))posts.set(id,{id,language:row.language,title:row.title,caption:row.caption,videoUrl:row.videoUrl,scheduledAt:row.scheduledAt,timezone:row.timezone,status:row.status,createdAt:row.createdAt,updatedAt:row.updatedAt,targets:[]});posts.get(id)!.targets.push({platform:row.platform,status:row.targetStatus,externalId:row.externalId,error:row.error});}
  return json({posts:[...posts.values()]});
 }catch{return json({error:'Scheduled posts could not be loaded.'},503);}
}

export async function POST(request:Request){
 const owner=user(request);if(!owner)return json({error:'Sign in to save posts.'},401);
 const body=await request.json().catch(()=>null) as Body|null;
 const platforms=[...new Set((body?.platforms??[]).filter((p):p is Platform=>allowed.includes(p)))];
 if(!body?.language||!['zu','en'].includes(body.language)||!body.title?.trim()||!body.scheduledAt||!platforms.length)return json({error:'Title, schedule, language and at least one platform are required.'},400);
 if(!validUrl(body.videoUrl))return json({error:'The video must use a public HTTPS URL.'},400);
 const id=crypto.randomUUID(),now=Date.now(),status=body.status==='ready'&&body.videoUrl?'ready':'draft';
 try{
  const database=db();await database.batch([database.prepare(`INSERT INTO posts (id,owner_id,language,title,caption,video_url,scheduled_at,timezone,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(id,owner,body.language,body.title.trim(),body.caption?.trim()??'',body.videoUrl?.trim()||null,body.scheduledAt,'Africa/Johannesburg',status,now,now),...platforms.map(platform=>database.prepare(`INSERT INTO post_targets (post_id,platform,status,updated_at) VALUES (?,?,?,?)`).bind(id,platform,status,now))]);
  return json({id,status,message:'Post saved. Nothing was published.'},201);
 }catch{return json({error:'The post could not be saved.'},503);}
}

export async function PATCH(request:Request){
 const owner=user(request);if(!owner)return json({error:'Sign in to update posts.'},401);
 const body=await request.json().catch(()=>null) as Body|null;
 const platforms=[...new Set((body?.platforms??[]).filter((p):p is Platform=>allowed.includes(p)))];
 if(!body?.id||!body.language||!body.title?.trim()||!body.scheduledAt||!platforms.length)return json({error:'Post id, title, schedule, language and platforms are required.'},400);
 if(!validUrl(body.videoUrl))return json({error:'The video must use a public HTTPS URL.'},400);
  const now=Date.now(),status=body.status==='ready'&&body.videoUrl?'ready':body.status==='paused'?'paused':'draft';
 try{
  const database=db();const owned=await database.prepare(`SELECT id,status FROM posts WHERE id=?`).bind(body.id).first() as {id?:string;status?:string}|null;if(!owned)return json({error:'Post not found.'},404);if(owned.status==='published'||owned.status==='publishing')return json({error:'Published posts cannot be edited.'},409);
  await database.batch([database.prepare(`UPDATE posts SET language=?,title=?,caption=?,video_url=?,scheduled_at=?,status=?,updated_at=? WHERE id=?`).bind(body.language,body.title.trim(),body.caption?.trim()??'',body.videoUrl?.trim()||null,body.scheduledAt,status,now,body.id),database.prepare(`DELETE FROM post_targets WHERE post_id=?`).bind(body.id),...platforms.map(platform=>database.prepare(`INSERT INTO post_targets (post_id,platform,status,updated_at) VALUES (?,?,?,?)`).bind(body.id,platform,status==='paused'?'draft':status,now))]);
  return json({id:body.id,status,message:'Post updated. Nothing was published.'});
 }catch{return json({error:'The post could not be updated.'},503);}
}

export async function DELETE(request:Request){
 const owner=user(request);if(!owner)return json({error:'Sign in to delete posts.'},401);
 const id=new URL(request.url).searchParams.get('id');if(!id)return json({error:'Post id is required.'},400);
 try{const owned=await db().prepare(`SELECT status FROM posts WHERE id=? AND owner_id IN (?, 'automation')`).bind(id,owner).first() as {status?:string}|null;if(!owned)return json({error:'Post not found.'},404);if(owned.status==='published'||owned.status==='publishing')return json({error:'Published posts cannot be deleted from the schedule.'},409);await db().prepare(`DELETE FROM posts WHERE id=? AND owner_id IN (?, 'automation')`).bind(id,owner).run();return json({deleted:true});}catch{return json({error:'The post could not be deleted.'},503);}
}

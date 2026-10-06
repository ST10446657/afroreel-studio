import {env} from 'cloudflare:workers';
import {publishTarget,readiness,type Platform,type PublishPost} from './publishing';
import type {Language} from './languages';

type D1Result={meta?:{changes?:number};results?:Record<string,unknown>[]};
type Statement={bind:(...values:unknown[])=>Statement;first:()=>Promise<Record<string,unknown>|null>;all:()=>Promise<D1Result>;run:()=>Promise<D1Result>};
type D1={prepare:(sql:string)=>Statement};
const db=()=>{const value=(env as unknown as {DB?:D1}).DB;if(!value)throw Error('Post storage is unavailable.');return value};

export async function loadPost(id:string,owner?:string){
 // Schedules are shared workspace records. The authenticated Site account can
 // change between sessions, so publishing must resolve the record by its ID.
 const where='p.id=?';
 const args=[id];
 const rows=await db().prepare(`SELECT p.id,p.language,p.title,p.caption,p.video_url AS videoUrl,p.scheduled_at AS scheduledAt,t.platform,t.status AS targetStatus,t.external_id AS externalId FROM posts p JOIN post_targets t ON t.post_id=p.id WHERE ${where} ORDER BY t.platform`).bind(...args).all();
 if(!rows.results?.length)return null;
 const first=rows.results[0];
 return {id:String(first.id),language:first.language as Language,title:String(first.title),caption:typeof first.caption==='string'?first.caption:'',videoUrl:typeof first.videoUrl==='string'?first.videoUrl:'',scheduledAt:String(first.scheduledAt),targets:rows.results.map(row=>({platform:row.platform as Platform,status:String(row.targetStatus),externalId:typeof row.externalId==='string'?row.externalId:null}))};
}

export async function validatePost(post:Awaited<ReturnType<typeof loadPost>>){
 if(!post)throw Error('Post not found.');
 if(!post.videoUrl||!/^https:\/\//i.test(post.videoUrl))throw Error('Add a public HTTPS video URL.');
 const media=await fetch(post.videoUrl,{headers:{Range:'bytes=0-0'},redirect:'follow',signal:AbortSignal.timeout(15000)}).catch(()=>null);
 const contentType=media?.headers.get('content-type')?.toLowerCase()??'';
 void media?.body?.cancel();
 if(!media?.ok||(!contentType.startsWith('video/')&&!contentType.includes('application/octet-stream')&&!contentType.includes('application/binary')))throw Error('The video URL must open the video file directly. Google Drive share-page links are not supported.');
 return post.targets.map(target=>({platform:target.platform,connected:readiness(post.language,target.platform),status:readiness(post.language,target.platform)?'ready':'not_connected'}));
}

async function refreshOverall(id:string){
 const rows=await db().prepare(`SELECT status FROM post_targets WHERE post_id=?`).bind(id).all();
 const states=(rows.results??[]).map(row=>String(row.status));
 const status=states.every(s=>s==='published')?'published':states.some(s=>s==='publishing')?'publishing':states.some(s=>s==='failed')?'failed':states.some(s=>s==='queued')?'queued':'ready';
 await db().prepare(`UPDATE posts SET status=?,updated_at=? WHERE id=?`).bind(status,Date.now(),id).run();
 return status;
}

export async function queuePost(id:string,owner:string){
 const post=await loadPost(id,owner),plan=await validatePost(post);
 if(!post||new Date(post.scheduledAt).getTime()<=Date.now()+60000)throw Error('Choose a time at least one minute in the future.');
 if(post.targets.some(target=>target.externalId||target.status==='published'||target.status==='publishing'))throw Error('A post that has started publishing cannot be scheduled again.');
 if(post.targets.length&&post.targets.every(target=>target.status==='queued'))return post;
 const missing=plan.filter(item=>!item.connected);
 if(missing.length)throw Error(`${missing.map(x=>x.platform).join(', ')} ${missing.length===1?'is':'are'} not connected.`);
 await db().prepare(`UPDATE post_targets SET status='queued',error=NULL,updated_at=? WHERE post_id=? AND status IN ('draft','ready','failed')`).bind(Date.now(),id).run();
 await db().prepare(`UPDATE posts SET status='queued',updated_at=? WHERE id=? AND owner_id=?`).bind(Date.now(),id,owner).run();
 return await loadPost(id,owner);
}

export async function dispatchPost(id:string,owner?:string,onlyFailed=false){
 const post=await loadPost(id,owner);if(!post)throw Error('Post not found.');
 await validatePost(post);
 const eligible=onlyFailed?['failed']:['ready','queued','failed'];
 const results=[] as {platform:Platform;status:string;externalId?:string;error?:string}[];
 for(const target of post.targets){
  if(target.externalId){results.push({platform:target.platform,status:'published',externalId:target.externalId});continue}
  if(!eligible.includes(target.status))continue;
  const claim=await db().prepare(`UPDATE post_targets SET status='publishing',error=NULL,updated_at=? WHERE post_id=? AND platform=? AND external_id IS NULL AND status=?`).bind(Date.now(),id,target.platform,target.status).run();
  if(!claim.meta?.changes)continue;
  await refreshOverall(id);
  const result=await publishTarget(post as PublishPost,target.platform);
  if(result.ok){await db().prepare(`UPDATE post_targets SET status='published',external_id=?,error=NULL,updated_at=? WHERE post_id=? AND platform=? AND status='publishing'`).bind(result.externalId,Date.now(),id,target.platform).run();results.push({platform:target.platform,status:'published',externalId:result.externalId})}
  else{await db().prepare(`UPDATE post_targets SET status='failed',error=?,updated_at=? WHERE post_id=? AND platform=? AND status='publishing'`).bind(result.error,Date.now(),id,target.platform).run();results.push({platform:target.platform,status:'failed',error:result.error})}
 }
 const status=await refreshOverall(id);return {id,status,results};
}

export async function dispatchDue(){
 const now=new Date().toISOString();
 const rows=await db().prepare(`SELECT DISTINCT p.id FROM posts p JOIN post_targets t ON t.post_id=p.id WHERE datetime(p.scheduled_at)<=datetime(?) AND t.status='queued' ORDER BY datetime(p.scheduled_at) LIMIT 10`).bind(now).all();
 const results=[];for(const row of rows.results??[])results.push(await dispatchPost(String(row.id)));
 return results;
}

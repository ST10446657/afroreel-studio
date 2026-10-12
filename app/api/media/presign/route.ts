import {env} from 'cloudflare:workers';
import {isAuthenticated} from '@/lib/auth';
import {isLanguage,zernioPrefix} from '@/lib/languages';

export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers});
const maxSize=5*1024*1024*1024;

export async function POST(request:Request){
 if(!isAuthenticated(request))return json({error:'Sign in to upload a video.'},401);
 const body=await request.json().catch(()=>null) as {language?:unknown;filename?:unknown;contentType?:unknown;size?:unknown}|null;
 if(!body||!isLanguage(body.language))return json({error:'Choose a supported language workspace.'},400);
 const filename=typeof body.filename==='string'?body.filename.trim():'';
 const contentType=typeof body.contentType==='string'?body.contentType.trim().toLowerCase():'';
 const size=typeof body.size==='number'?body.size:NaN;
 if(!filename||!contentType.startsWith('video/'))return json({error:'Choose a supported video file.'},400);
 if(!Number.isFinite(size)||size<=0||size>maxSize)return json({error:'The video must be smaller than 5 GB.'},400);
 const cfg=env as unknown as Record<string,string|undefined>;
 const key=cfg[`${zernioPrefix(body.language)}_API_KEY`];
 if(!key)return json({error:'Video uploads are not configured for this workspace.'},503);
 try{
  const response=await fetch('https://zernio.com/api/v1/media/presign',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({filename,contentType,size}),signal:AbortSignal.timeout(15000)});
  const result=await response.json().catch(()=>({})) as {uploadUrl?:string;publicUrl?:string;error?:string;message?:string};
  if(!response.ok||!result.uploadUrl||!result.publicUrl)return json({error:result.message||result.error||`Zernio could not prepare the upload (HTTP ${response.status}).`},502);
  return json({uploadUrl:result.uploadUrl,publicUrl:result.publicUrl});
 }catch{return json({error:'The upload service did not respond. Try again.'},502)}
}

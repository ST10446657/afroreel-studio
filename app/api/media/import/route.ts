import {env} from 'cloudflare:workers';
import {isAuthenticated} from '@/lib/auth';
import {isLanguage,zernioPrefix} from '@/lib/languages';

export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers});

function driveId(value:string){
 try{
  const url=new URL(value);
  if(!['drive.google.com','docs.google.com'].includes(url.hostname))return null;
  return url.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)?.[1]??url.searchParams.get('id');
 }catch{return null}
}
function filenameFrom(disposition:string|null,id:string){
 const encoded=disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
 const plain=disposition?.match(/filename="?([^";]+)"?/i)?.[1];
 try{return decodeURIComponent(encoded||plain||`${id}.mp4`)}catch{return `${id}.mp4`}
}

export async function POST(request:Request){
 if(!isAuthenticated(request))return json({error:'Sign in to import a video.'},401);
 const body=await request.json().catch(()=>null) as {language?:unknown;url?:unknown}|null;
 if(!body||!isLanguage(body.language)||typeof body.url!=='string')return json({error:'Choose a supported language and video link.'},400);
 const id=driveId(body.url);
 if(!id)return json({error:'This importer supports Google Drive share links. You can also paste a direct video URL or upload the file.'},400);
 const cfg=env as unknown as Record<string,string|undefined>;
 const key=cfg[`${zernioPrefix(body.language)}_API_KEY`];
 if(!key)return json({error:'Video imports are not configured for this workspace.'},503);
 try{
  const source=await fetch(`https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`,{redirect:'follow',signal:AbortSignal.timeout(60000)});
  const sourceType=(source.headers.get('content-type')||'').split(';')[0].toLowerCase();
  if(!source.ok||!source.body||sourceType.includes('text/html'))return json({error:'Google Drive did not provide the video file. Set sharing to “Anyone with the link”, or upload the file from your computer.'},400);
  const contentType=sourceType.startsWith('video/')?sourceType:'video/mp4';
  const filename=filenameFrom(source.headers.get('content-disposition'),id);
  const size=Number(source.headers.get('content-length'));
  const details:{filename:string;contentType:string;size?:number}={filename,contentType};
  if(Number.isFinite(size)&&size>0)details.size=size;
  const presign=await fetch('https://zernio.com/api/v1/media/presign',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(details),signal:AbortSignal.timeout(15000)});
  const destination=await presign.json().catch(()=>({})) as {uploadUrl?:string;publicUrl?:string;error?:string;message?:string};
  if(!presign.ok||!destination.uploadUrl||!destination.publicUrl)return json({error:destination.message||destination.error||'Zernio could not prepare the imported video.'},502);
  const upload=await fetch(destination.uploadUrl,{method:'PUT',headers:{'Content-Type':contentType},body:source.body,signal:AbortSignal.timeout(300000)});
  if(!upload.ok)return json({error:`The video transfer failed (HTTP ${upload.status}). Try uploading the file instead.`},502);
  return json({publicUrl:destination.publicUrl});
 }catch{return json({error:'The Google Drive video could not be imported. Check sharing, then try again or upload the file.'},502)}
}

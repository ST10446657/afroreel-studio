import {env} from 'cloudflare:workers';
import {isLanguage,metaPrefix} from '@/lib/languages';
import {isAuthenticated} from '@/lib/auth';

export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers});
type GraphError={error?:{message?:string;type?:string;code?:number;error_subcode?:number}};

const safeError=(body:GraphError,status:number)=>({
 message:body.error?.message?.slice(0,240)??`Meta returned HTTP ${status}.`,
 type:body.error?.type??null,
 code:body.error?.code??null,
 subcode:body.error?.error_subcode??null,
});

export async function GET(request:Request){
 if(!isAuthenticated(request))return json({error:'Sign in to run Meta diagnostics.'},401);
 const language=new URL(request.url).searchParams.get('language');
 if(!isLanguage(language))return json({error:'Choose a supported language.'},400);
 const cfg=env as unknown as Record<string,string|undefined>;
 const prefix=metaPrefix(language);
 const token=cfg[`${prefix}_SYSTEM_USER_TOKEN`]||cfg.META_SHARED_SYSTEM_USER_TOKEN;
 const pageId=cfg[`${prefix}_PAGE_ID`];
 const igId=cfg[`${prefix}_IG_USER_ID`];
 const graph=cfg.META_GRAPH_VERSION??'v21.0';
 const get=async(path:string)=>{
  const response=await fetch(`https://graph.facebook.com/${graph}/${path}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});
  const body=await response.json() as Record<string,unknown>&GraphError;
  return response.ok?{ok:true as const,data:body}:{ok:false as const,error:safeError(body,response.status)};
 };
 if(!token)return json({error:'This Meta workspace is not configured.'},503);
 if(!pageId||!igId){
  const assets=await get('me/accounts?limit=100&fields=id,name,instagram_business_account{id,username}');
  return json({language,configured:false,assets:assets.ok?assets.data:assets});
 }
 const [identity,permissions,pages,targetPage,targetInstagram]=await Promise.all([
  get('me?fields=id,name'),
  get('me/permissions'),
  get('me/accounts?limit=100&fields=id,name,tasks'),
  get(`${pageId}?fields=id,name,instagram_business_account{id,username}`),
  get(`${igId}?fields=id,username`),
 ]);
 const granted=permissions.ok&&Array.isArray(permissions.data.data)?(permissions.data.data as {permission?:string;status?:string}[]).filter(row=>row.status==='granted').map(row=>row.permission).filter(Boolean):[];
 const pageRows=pages.ok&&Array.isArray(pages.data.data)?pages.data.data as {id?:string;name?:string;tasks?:string[]}[]:[];
 return json({
  language,
  identity:identity.ok?identity.data:identity,
  permissions:permissions.ok?{ok:true,granted}:permissions,
  pages:pages.ok?{ok:true,count:pageRows.length,targetAssigned:pageRows.some(page=>page.id===pageId),targetTasks:pageRows.find(page=>page.id===pageId)?.tasks??[]}:pages,
  targetPage:targetPage.ok?{ok:true,name:targetPage.data.name??null,instagramLinked:Boolean(targetPage.data.instagram_business_account)}:targetPage,
  targetInstagram:targetInstagram.ok?{ok:true,username:targetInstagram.data.username??null}:targetInstagram,
 });
}

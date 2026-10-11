import {env} from 'cloudflare:workers';
import {isAuthenticated} from '@/lib/auth';
import {isLanguage,metaPrefix,zernioPrefix} from '@/lib/languages';

export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers});
type Check={platform:'Facebook'|'Instagram'|'TikTok'|'YouTube';ok:boolean;message:string};

async function getJson(url:string,token:string){
 const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});
 const body=await response.json().catch(()=>({})) as Record<string,unknown>;
 return {response,body};
}

export async function GET(request:Request){
 if(!isAuthenticated(request))return json({error:'Sign in to run a dry publish test.'},401);
 const language=new URL(request.url).searchParams.get('language');
 if(!isLanguage(language))return json({error:'Choose a supported language.'},400);
 const cfg=env as unknown as Record<string,string|undefined>;
 const checks:Check[]=[];

 const meta=metaPrefix(language),pageId=cfg[`${meta}_PAGE_ID`],igId=cfg[`${meta}_IG_USER_ID`];
 const metaToken=cfg[`${meta}_SYSTEM_USER_TOKEN`]||cfg.META_EN_SYSTEM_USER_TOKEN||cfg.META_SHARED_SYSTEM_USER_TOKEN;
 if(!metaToken||!pageId||!igId){
  checks.push({platform:'Facebook',ok:false,message:'Meta Page configuration is incomplete.'},{platform:'Instagram',ok:false,message:'Instagram configuration is incomplete.'});
 }else{
  const graph=`https://graph.facebook.com/${cfg.META_GRAPH_VERSION??'v21.0'}`;
  try{
   const [page,instagram]=await Promise.all([getJson(`${graph}/${pageId}?fields=id,name,access_token`,metaToken),getJson(`${graph}/${igId}?fields=id,username`,metaToken)]);
   checks.push(
    {platform:'Facebook',ok:page.response.ok&&typeof page.body.id==='string'&&typeof page.body.access_token==='string',message:page.response.ok?'Page and publishing token verified.':`Meta returned HTTP ${page.response.status}.`},
    {platform:'Instagram',ok:instagram.response.ok&&typeof instagram.body.id==='string',message:instagram.response.ok?'Professional Instagram account verified.':`Meta returned HTTP ${instagram.response.status}.`},
   );
  }catch{
   checks.push({platform:'Facebook',ok:false,message:'Meta connection check timed out.'},{platform:'Instagram',ok:false,message:'Meta connection check timed out.'});
  }
 }

 const zernio=zernioPrefix(language),key=cfg[`${zernio}_API_KEY`],profileId=cfg[`${zernio}_PROFILE_ID`];
 const targets=[['TikTok','tiktok',cfg[`${zernio}_TIKTOK_ACCOUNT_ID`]],['YouTube','youtube',cfg[`${zernio}_YOUTUBE_ACCOUNT_ID`]]] as const;
 if(!key||!profileId){
  for(const [platform] of targets)checks.push({platform,ok:false,message:'Zernio configuration is incomplete.'});
 }else{
  try{
   const {response,body}=await getJson(`https://zernio.com/api/v1/accounts?profileId=${encodeURIComponent(profileId)}`,key);
   const accounts=Array.isArray(body.accounts)?body.accounts as { _id?:string;platform?:string;isActive?:boolean;profileId?:string|{_id?:string}}[]:[];
   for(const [platform,apiPlatform,id] of targets){
    const account=accounts.find(row=>row._id===id&&row.platform===apiPlatform&&(typeof row.profileId==='string'?row.profileId:row.profileId?._id)===profileId);
    checks.push({platform,ok:response.ok&&Boolean(account?.isActive),message:!response.ok?`Zernio returned HTTP ${response.status}.`:account?.isActive?'Active Zernio publishing account verified.':'The configured account is missing or inactive.'});
   }
  }catch{
   for(const [platform] of targets)checks.push({platform,ok:false,message:'Zernio connection check timed out.'});
  }
 }
 return json({language,dryRun:true,willPublish:false,checkedAt:new Date().toISOString(),ready:checks.every(check=>check.ok),checks});
}

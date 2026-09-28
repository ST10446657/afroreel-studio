import { env } from 'cloudflare:workers';
export const dynamic = 'force-dynamic';
const headers = {'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const number = (v: unknown): number|null => typeof v === 'number' && Number.isFinite(v) ? v : null;
const safeUrl = (v:unknown) => typeof v==='string' && /^https:\/\/(www\.)?(youtube\.com|youtu\.be|tiktok\.com)\//.test(v) ? v : null;
type Metrics = Record<string,unknown>;
type RawPost = {_id:string;content?:string;publishedAt?:string;profileId?:string;platforms?:{platform?:string;accountId?:string;accountUsername?:string;platformPostId?:string;platformPostUrl?:string;syncStatus?:string;analytics?:Metrics}[]};
export async function GET(request:Request){
  if(!request.headers.get('oai-authenticated-user-id'))return Response.json({error:'Sign in to view analytics.'},{status:401,headers});
  const params=new URL(request.url).searchParams;
  const language=params.get('language');
  const days=Number(params.get('days')??30);
  if(!['zu','en'].includes(language??'')||![7,30,90].includes(days))return Response.json({error:'Choose a language and a 7, 30 or 90 day period.'},{status:400,headers});
  const cfg=env as unknown as Record<string,string|undefined>;
  const prefix=language==='en'?'ZERNIO_EN':'ZERNIO_ZU';
  const key=cfg[`${prefix}_API_KEY`],profile=cfg[`${prefix}_PROFILE_ID`];
  const toDate=new Date().toISOString().slice(0,10),fromDate=new Date(Date.now()-(days-1)*86400000).toISOString().slice(0,10);
  const channels=await Promise.all(['tiktok','youtube'].map(async platform=>{
    const accountId=cfg[`${prefix}_${platform.toUpperCase()}_ACCOUNT_ID`];
    const base={platform:platform==='youtube'?'YouTube':'TikTok',username:null as string|null,followers:null as number|null,updatedAt:null as string|null};
    if(!key||!profile||!accountId)return {...base,status:'unavailable',message:'This account is not connected.',posts:[]};
    try{
      const rows:RawPost[]=[];let totalPages=1;let truncated=false;
      for(let page=1;page<=Math.min(totalPages,10);page++){
        const query=new URLSearchParams({accountId,profileId:profile,platform,fromDate,toDate,limit:'100',page:String(page)});
        const r=await fetch(`https://zernio.com/api/v1/analytics?${query}`,{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(15000)});
        if(!r.ok)return {...base,status:'unavailable',message:r.status===402?'Zernio analytics access is required for this account.':r.status===401||r.status===403?'Zernio denied analytics access. Check the account permissions.':`Zernio could not return analytics (HTTP ${r.status}). Try Refresh.`,posts:[]};
        const data=await r.json() as {hasAnalyticsAccess?:boolean;posts?:RawPost[];pagination?:{pages?:number};overview?:{lastSync?:string};accounts?:{_id:string;username?:string;followersCount?:number}[]};
        if(data.hasAnalyticsAccess===false)return {...base,status:'unavailable',message:'Zernio analytics access is required for this account.',posts:[]};
        if(!Array.isArray(data.posts))throw Error('Unexpected response');
        rows.push(...data.posts);totalPages=data.pagination?.pages??1;truncated=totalPages>10;
        const account=data.accounts?.find(a=>a._id===accountId);
        base.username=account?.username??base.username;base.followers=number(account?.followersCount)??base.followers;base.updatedAt=data.overview?.lastSync??base.updatedAt;
      }
      const seen=new Set<string>();
      const posts=rows.flatMap(p=>{
        if(p.profileId&&p.profileId!==profile)return [];
        const a=p.platforms?.find(a=>a.accountId===accountId&&a.platform===platform);
        if(!a||seen.has(p._id))return [];seen.add(p._id);
        const m=a.syncStatus==='synced'?a.analytics??{}:{};
        return [{id:p._id,title:p.content||'Untitled video',publishedAt:p.publishedAt??null,url:safeUrl(a.platformPostUrl),views:number(m.views),likes:number(m.likes),comments:number(m.comments),shares:platform==='youtube'?null:number(m.shares),syncStatus:a.syncStatus??'pending'}];
      });
      return {...base,status:'ready',message:truncated?'Showing the most recent 1,000 posts. Narrow the date range for complete totals.':null,posts};
    }catch{return {...base,status:'unavailable',message:'Analytics could not be loaded. Try Refresh.',posts:[]};}
  }));
  return Response.json({language,fromDate,toDate,checkedAt:new Date().toISOString(),channels},{headers});
}

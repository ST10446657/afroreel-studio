import {env} from 'cloudflare:workers';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers});
const num=(value:unknown):number|null=>typeof value==='number'&&Number.isFinite(value)?value:null;
type GraphError={error?:{message?:string;code?:number}};
type Insight={name?:string;values?:{value?:unknown}[]};
const insight=(rows:Insight[]|undefined,name:string)=>num(rows?.find(row=>row.name===name)?.values?.[0]?.value);

export async function GET(request:Request){
 if(!request.headers.get('oai-authenticated-user-id'))return json({error:'Sign in to view Meta analytics.'},401);
 const query=new URL(request.url).searchParams;
 const language=query.get('language');
 const days=Number(query.get('days')??30);
 if(!['zu','en'].includes(language??'')||![7,30,90].includes(days))return json({error:'Choose a language and a 7, 30 or 90 day period.'},400);
 const cfg=env as unknown as Record<string,string|undefined>;
 const prefix=language==='en'?'META_EN':'META';
 const token=cfg[`${prefix}_SYSTEM_USER_TOKEN`],pageId=cfg[`${prefix}_PAGE_ID`],configuredIgId=cfg[`${prefix}_IG_USER_ID`],businessId=cfg[`${prefix}_BUSINESS_ID`];
 if(!token||!pageId||!configuredIgId)return json({language,channels:[
  {platform:'Facebook',status:'unavailable',message:'This account is not connected.',username:null,followers:null,posts:[]},
  {platform:'Instagram',status:'unavailable',message:'This account is not connected.',username:null,followers:null,posts:[]},
 ]});
 const graph=cfg.META_GRAPH_VERSION??'v21.0';
 const base=`https://graph.facebook.com/${graph}`;
 const since=Math.floor((Date.now()-(days-1)*86400000)/1000);
 const until=Math.floor(Date.now()/1000);
 const fetchGraph=async<T>(path:string,accessToken=token)=>{
  const response=await fetch(`${base}/${path}`,{headers:{Authorization:`Bearer ${accessToken}`},signal:AbortSignal.timeout(15000)});
  const body=await response.json() as T&GraphError;
  if(!response.ok)throw new Error(body.error?.message||`Meta returned HTTP ${response.status}.`);
  return body;
 };
 const pageContext=await (async()=>{
  try{
   const page=await fetchGraph<{id:string;name?:string;access_token?:string;instagram_business_account?:{id:string;username?:string}}>(`${pageId}?fields=id,name,access_token,instagram_business_account{id,username}`);
   return {pageToken:page.access_token??token,instagramId:page.instagram_business_account?.id??configuredIgId};
  }catch{return {pageToken:token,instagramId:configuredIgId};}
 })();
 const facebook=async()=>{
  try{
   const [account,feed]=await Promise.all([
    fetchGraph<{id:string;name?:string;fan_count?:number}>(`${pageId}?fields=id,name,fan_count`,pageContext.pageToken),
    fetchGraph<{data?:{id:string;message?:string;created_time?:string;permalink_url?:string;reactions?:{summary?:{total_count?:number}};comments?:{summary?:{total_count?:number}};shares?:{count?:number};attachments?:{data?:{target?:{id?:string};media_type?:string}[]}}[]}>(`${pageId}/published_posts?since=${since}&until=${until}&limit=100&fields=id,message,created_time,permalink_url,reactions.limit(0).summary(true),comments.limit(0).summary(true),shares,attachments.limit(1){target,media_type}`,pageContext.pageToken),
   ]);
   let metricMessage:string|null=null;
   const posts=await Promise.all((feed.data??[]).map(async post=>{
   let views:number|null=null;
   const videoId=post.attachments?.data?.[0]?.target?.id;
    let postMetricError:string|null=null;
    try{
     const metrics=await fetchGraph<{data?:Insight[]}>(`${post.id}/insights?metric=post_video_views&period=lifetime`,pageContext.pageToken);
     views=insight(metrics.data,'post_video_views');
    }catch(error){postMetricError=error instanceof Error?error.message:'Meta did not return Facebook post video views.';}
    if(views===null&&videoId){
     try{
      const metrics=await fetchGraph<{data?:Insight[]}>(`${videoId}/video_insights?metric=total_video_views&period=lifetime`,pageContext.pageToken);
      views=insight(metrics.data,'total_video_views');
     }catch(error){metricMessage??=postMetricError??(error instanceof Error?error.message:'Meta did not return Facebook video views.');}
    }else if(views===null&&postMetricError){metricMessage??=postMetricError;}
    return {id:post.id,title:post.message||'Facebook post',publishedAt:post.created_time??null,url:post.permalink_url??null,views,likes:num(post.reactions?.summary?.total_count),comments:num(post.comments?.summary?.total_count),shares:num(post.shares?.count),syncStatus:'synced'};
   }));
   return {platform:'Facebook',status:'ready',message:metricMessage,username:account.name??null,followers:num(account.fan_count),updatedAt:new Date().toISOString(),posts};
  }catch(error){return {platform:'Facebook',status:'unavailable',message:error instanceof Error?error.message:'Meta could not load Facebook analytics.',username:null,followers:null,posts:[]};}
 };
 const instagram=async()=>{
  try{
   let igId=pageContext.instagramId;
   if(igId===configuredIgId&&businessId){
    const owned=await fetchGraph<{data?:{id:string;username?:string}[]}>(`${businessId}/owned_instagram_accounts?limit=100&fields=id,username`);
    const candidate=(owned.data??[]).find(account=>account.id===configuredIgId)||(owned.data??[])[0];
    if(candidate?.id)igId=candidate.id;
   }
   const [account,media]=await Promise.all([
    fetchGraph<{id:string;username?:string;followers_count?:number}>(`${igId}?fields=id,username,followers_count`),
    fetchGraph<{data?:{id:string;caption?:string;timestamp?:string;permalink?:string;like_count?:number;comments_count?:number;insights?:{data?:Insight[]}}[]}>(`${igId}/media?since=${since}&until=${until}&limit=100&fields=id,caption,timestamp,permalink,like_count,comments_count,insights.metric(views,shares,saved)`),
   ]);
   const posts=(media.data??[]).map(post=>({id:post.id,title:post.caption||'Instagram post',publishedAt:post.timestamp??null,url:post.permalink??null,views:insight(post.insights?.data,'views'),likes:num(post.like_count),comments:num(post.comments_count),shares:insight(post.insights?.data,'shares'),saves:insight(post.insights?.data,'saved'),syncStatus:'synced'}));
   return {platform:'Instagram',status:'ready',message:null,username:account.username??null,followers:num(account.followers_count),updatedAt:new Date().toISOString(),posts};
  }catch(error){return {platform:'Instagram',status:'unavailable',message:error instanceof Error?error.message:'Meta could not load Instagram analytics.',username:null,followers:null,posts:[]};}
 };
 const channels=await Promise.all([facebook(),instagram()]);
 return json({language,fromDate:new Date(since*1000).toISOString().slice(0,10),toDate:new Date(until*1000).toISOString().slice(0,10),checkedAt:new Date().toISOString(),channels});
}

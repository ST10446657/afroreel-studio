import {env} from 'cloudflare:workers';

export const platforms=['Instagram','TikTok','Facebook','YouTube'] as const;
export type Platform=typeof platforms[number];
export type Language='zu'|'en';
export type PublishPost={id:string;language:Language;title:string;caption:string;videoUrl:string;scheduledAt:string};
type Config=Record<string,string|undefined>;

const config=()=>env as unknown as Config;
const graphBase=()=>`https://graph.facebook.com/${config().META_GRAPH_VERSION??'v21.0'}`;
const cleanError=(value:unknown)=>value instanceof Error?value.message.replace(/EA[A-Za-z0-9]+/g,'[redacted]').slice(0,300):'The provider rejected this post.';
const responseBody=async(response:Response)=>await response.json().catch(()=>({})) as Record<string,unknown>;
const providerError=(body:Record<string,unknown>,fallback:string)=>{
 const error=body.error as {message?:unknown}|undefined;
 return typeof error?.message==='string'?error.message:fallback;
};

export function readiness(language:Language,platform:Platform){
 const cfg=config();
 if(platform==='Facebook'||platform==='Instagram'){
  const p=language==='en'?'META_EN':'META';
  return Boolean(cfg[`${p}_SYSTEM_USER_TOKEN`]&&cfg[`${p}_PAGE_ID`]&&cfg[`${p}_IG_USER_ID`]);
 }
 const p=language==='en'?'ZERNIO_EN':'ZERNIO_ZU';
 return Boolean(cfg[`${p}_API_KEY`]&&cfg[`${p}_${platform==='TikTok'?'TIKTOK':'YOUTUBE'}_ACCOUNT_ID`]);
}

async function metaContext(language:Language){
 const cfg=config(),prefix=language==='en'?'META_EN':'META';
 const token=cfg[`${prefix}_SYSTEM_USER_TOKEN`],pageId=cfg[`${prefix}_PAGE_ID`],igId=cfg[`${prefix}_IG_USER_ID`];
 if(!token||!pageId||!igId)throw Error('This Meta workspace is not connected.');
 const response=await fetch(`${graphBase()}/${pageId}?fields=access_token`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});
 const body=await responseBody(response);
 if(!response.ok)throw Error(providerError(body,'Meta could not authorize the Page.'));
 return {pageId,igId,token:typeof body.access_token==='string'?body.access_token:token};
}

async function facebook(post:PublishPost){
 const meta=await metaContext(post.language);
 const form=new URLSearchParams({file_url:post.videoUrl,description:post.caption,access_token:meta.token});
 const response=await fetch(`${graphBase()}/${meta.pageId}/videos`,{method:'POST',body:form,signal:AbortSignal.timeout(30000)});
 const body=await responseBody(response);
 if(!response.ok)throw Error(providerError(body,'Facebook rejected the video.'));
 const id=body.id;
 if(typeof id!=='string')throw Error('Facebook did not return a video ID.');
 return id;
}

async function instagram(post:PublishPost){
 const meta=await metaContext(post.language);
 const create=new URLSearchParams({media_type:'REELS',video_url:post.videoUrl,caption:post.caption,access_token:meta.token});
 const created=await fetch(`${graphBase()}/${meta.igId}/media`,{method:'POST',body:create,signal:AbortSignal.timeout(30000)});
 const createdBody=await responseBody(created);
 if(!created.ok)throw Error(providerError(createdBody,'Instagram rejected the video.'));
 const container=createdBody.id;
 if(typeof container!=='string')throw Error('Instagram did not return a media container.');
 let ready=false;
 for(let attempt=0;attempt<18;attempt++){
  if(attempt)await new Promise(resolve=>setTimeout(resolve,5000));
  const status=await fetch(`${graphBase()}/${container}?fields=status_code,status&access_token=${encodeURIComponent(meta.token)}`,{signal:AbortSignal.timeout(15000)});
  const statusBody=await responseBody(status);
  if(!status.ok)throw Error(providerError(statusBody,'Instagram could not check the video status.'));
  if(statusBody.status_code==='FINISHED'){ready=true;break}
  if(statusBody.status_code==='ERROR'||statusBody.status_code==='EXPIRED')throw Error(typeof statusBody.status==='string'?statusBody.status:'Instagram could not process the video.');
 }
 if(!ready)throw Error('Instagram is still processing the video. Retry in a few minutes.');
 const publish=new URLSearchParams({creation_id:container,access_token:meta.token});
 const response=await fetch(`${graphBase()}/${meta.igId}/media_publish`,{method:'POST',body:publish,signal:AbortSignal.timeout(30000)});
 const body=await responseBody(response);
 if(!response.ok)throw Error(providerError(body,'Instagram could not publish the Reel.'));
 const id=body.id;
 if(typeof id!=='string')throw Error('Instagram did not return a media ID.');
 return id;
}

async function zernio(post:PublishPost,platform:'TikTok'|'YouTube'){
 const cfg=config(),prefix=post.language==='en'?'ZERNIO_EN':'ZERNIO_ZU';
 const key=cfg[`${prefix}_API_KEY`],accountId=cfg[`${prefix}_${platform==='TikTok'?'TIKTOK':'YOUTUBE'}_ACCOUNT_ID`];
 if(!key||!accountId)throw Error(`The ${platform} account is not connected.`);
 const payload={content:post.caption,title:post.title,mediaItems:[{url:post.videoUrl,type:'video'}],platforms:[{platform:platform.toLowerCase(),accountId}],scheduledFor:new Date(Date.now()+60000).toISOString(),timezone:'Africa/Johannesburg'};
 const response=await fetch('https://zernio.com/api/v1/posts',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)});
 const body=await responseBody(response);
 if(!response.ok)throw Error(providerError(body,`${platform} rejected the post.`));
 const post=body.post as Record<string,unknown>|undefined;
 const id=body._id??body.id??post?._id??post?.id;
 if(typeof id!=='string')throw Error(`${platform} did not return a post ID.`);
 return id;
}

export async function publishTarget(post:PublishPost,platform:Platform){
 try{
  const externalId=platform==='Facebook'?await facebook(post):platform==='Instagram'?await instagram(post):await zernio(post,platform);
  return {ok:true as const,externalId};
 }catch(error){return {ok:false as const,error:cleanError(error)}}
}

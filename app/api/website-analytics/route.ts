import {env} from 'cloudflare:workers';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers});

export async function GET(request:Request){
 if(!request.headers.get('oai-authenticated-user-id'))return json({error:'Sign in to view website analytics.'},401);
 const params=new URL(request.url).searchParams;
 const days=Number(params.get('days')??30);
 if(![7,30,90].includes(days))return json({error:'Choose a 7, 30 or 90 day period.'},400);
 const cfg=env as unknown as Record<string,string|undefined>;
 const key=cfg.LOVABLE_ANALYTICS_API_KEY,url=cfg.LOVABLE_ANALYTICS_URL;
 if(!key||!url)return json({error:'Website analytics is not connected.'},503);
 const to=new Date(),from=new Date(to.getTime()-(days-1)*86400000);
 const endpoint=new URL(url);endpoint.searchParams.set('from',from.toISOString());endpoint.searchParams.set('to',to.toISOString());
 try{
  const response=await fetch(endpoint,{headers:{'x-api-key':key},signal:AbortSignal.timeout(15000)});
  const body=await response.json() as {period?:{from?:string;to?:string};visitors?:number;episodeViews?:number;signups?:number;topEpisodes?:unknown[];error?:string};
  if(!response.ok)return json({error:body.error||`Website analytics returned HTTP ${response.status}.`},response.status);
  if(typeof body.visitors!=='number'||typeof body.episodeViews!=='number'||typeof body.signups!=='number'||!Array.isArray(body.topEpisodes))return json({error:'Website analytics returned an unexpected response.'},502);
  return json(body);
 }catch{return json({error:'Website analytics could not be loaded. Try Refresh.'},502);}
}

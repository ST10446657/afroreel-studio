import {env} from 'cloudflare:workers';
import {isAuthenticated} from '@/lib/auth';

export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers});

export async function GET(request:Request){
 if(!isAuthenticated(request))return json({error:'Sign in to view Meta assets.'},401);
 const cfg=env as unknown as Record<string,string|undefined>;
 const token=cfg.META_SHARED_SYSTEM_USER_TOKEN;
 if(!token)return json({error:'The shared Meta system-user token is not configured.'},503);
 const graph=cfg.META_GRAPH_VERSION??'v21.0';
 const response=await fetch(`https://graph.facebook.com/${graph}/me/accounts?limit=100&fields=id,name,instagram_business_account{id,username}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});
 const body=await response.json() as {data?:unknown[];error?:{message?:string}};
 if(!response.ok)return json({error:body.error?.message??`Meta returned HTTP ${response.status}.`},502);
 return json({assets:body.data??[]});
}

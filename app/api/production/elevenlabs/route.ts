import {env} from 'cloudflare:workers';
import {authenticatedUser} from '@/lib/auth';

export const dynamic='force-dynamic';
const responseHeaders={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:responseHeaders});

type Subscription={tier?:string;status?:string;character_count?:number;character_limit?:number;next_character_count_reset_unix?:number};

async function eleven(path:string,key:string){
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12_000);
 try{return await fetch(`https://api.elevenlabs.io${path}`,{headers:{'xi-api-key':key,'Accept':'application/json'},signal:controller.signal})}finally{clearTimeout(timeout)}
}

export async function GET(request:Request){
 if(!authenticatedUser(request))return json({error:'Sign in to check ElevenLabs.'},401);
 const key=(env as unknown as {ELEVENLABS_API_KEY?:string}).ELEVENLABS_API_KEY;
 if(!key)return json({configured:false,connected:false,error:'ElevenLabs is not configured.'},503);
 try{
  const [subscriptionResponse,dubbingResponse]=await Promise.all([eleven('/v1/user/subscription',key),eleven('/v1/dubbing/project?page_size=1',key)]);
  if(!subscriptionResponse.ok){
   const message=subscriptionResponse.status===401?'The ElevenLabs key was rejected.':'ElevenLabs account details could not be read.';
   return json({configured:true,connected:false,error:message},subscriptionResponse.status===401?401:502);
  }
  const subscription=await subscriptionResponse.json() as Subscription;
  const tier=subscription.tier??'unknown';
  return json({
   configured:true,
   connected:true,
   account:{tier,status:subscription.status??'unknown',creditsUsed:subscription.character_count??null,creditLimit:subscription.character_limit??null},
   capabilities:{dubbingRead:dubbingResponse.ok,musicGeneration:'not_tested',transcriptEditing:tier.toLowerCase().includes('enterprise')?'available':'requires_enterprise'},
   safety:{generationEnabled:false,paidRequestsMade:0,message:'Connection check only. No media was generated.'}
  });
 }catch{return json({configured:true,connected:false,error:'ElevenLabs could not be reached. No paid request was made.'},502)}
}

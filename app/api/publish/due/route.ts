import {env} from 'cloudflare:workers';
import {dispatchDue} from '@/lib/dispatch';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 const secret=(env as unknown as Record<string,string|undefined>).SCHEDULER_SECRET;
 if(!secret||request.headers.get('authorization')!==`Bearer ${secret}`)return Response.json({error:'Unauthorized.'},{status:401});
 try{return Response.json({processed:await dispatchDue()})}catch{return Response.json({error:'Due posts could not be processed.'},{status:500})}
}

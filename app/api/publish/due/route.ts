import {env} from 'cloudflare:workers';
import {dispatchDue} from '@/lib/dispatch';
export const dynamic='force-dynamic';
type D1={prepare:(sql:string)=>{bind:(...values:unknown[])=>any;first:()=>Promise<Record<string,unknown>|null>;run:()=>Promise<unknown>}};
const db=()=>{const value=(env as unknown as {DB?:D1}).DB;if(!value)throw Error('Post storage is unavailable.');return value};
const setup=async()=>{await db().prepare(`CREATE TABLE IF NOT EXISTS scheduler_state (id INTEGER PRIMARY KEY CHECK(id=1),last_run_at TEXT NOT NULL,last_result TEXT NOT NULL)`).run()};
const authenticated=(request:Request)=>Boolean(request.headers.get('oai-authenticated-user-id'));

export async function GET(request:Request){
 if(!authenticated(request))return Response.json({error:'Unauthorized.'},{status:401});
 try{
  await setup();
  const state=await db().prepare(`SELECT last_run_at AS lastRunAt,last_result AS lastResult FROM scheduler_state WHERE id=1`).first();
  const due=await db().prepare(`SELECT COUNT(DISTINCT p.id) AS count FROM posts p JOIN post_targets t ON t.post_id=p.id WHERE datetime(p.scheduled_at)<=datetime(?) AND t.status='queued'`).bind(new Date().toISOString()).first();
  return Response.json({lastRunAt:state?.lastRunAt??null,lastResult:state?.lastResult??null,due:Number(due?.count??0)});
 }catch{return Response.json({error:'Scheduler status could not be loaded.'},{status:500})}
}
export async function POST(request:Request){
 const secret=(env as unknown as Record<string,string|undefined>).SCHEDULER_SECRET;
 if(!authenticated(request)&&(!secret||request.headers.get('authorization')!==`Bearer ${secret}`))return Response.json({error:'Unauthorized.'},{status:401});
 try{
  await setup();
  const processed=await dispatchDue(),lastRunAt=new Date().toISOString();
  await db().prepare(`INSERT INTO scheduler_state (id,last_run_at,last_result) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET last_run_at=excluded.last_run_at,last_result=excluded.last_result`).bind(lastRunAt,JSON.stringify({processed:processed.length})).run();
  return Response.json({lastRunAt,processed});
 }catch{return Response.json({error:'Due posts could not be processed.'},{status:500})}
}

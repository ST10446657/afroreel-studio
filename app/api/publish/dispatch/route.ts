import {dispatchPost,loadPost,queuePost,validatePost} from '@/lib/dispatch';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers});
type Body={id?:string;action?:'validate'|'schedule'|'publish_now'|'retry'};

export async function POST(request:Request){
 const owner=request.headers.get('oai-authenticated-user-id');if(!owner)return json({error:'Sign in to manage publishing.'},401);
 const body=await request.json().catch(()=>null) as Body|null;if(!body?.id)return json({error:'Post id is required.'},400);
 const action=body.action??'validate';
 try{
  if(action==='validate'){const post=await loadPost(body.id,owner);return json({action,willPublish:false,platforms:await validatePost(post)});}
  if(action==='schedule'){const post=await queuePost(body.id,owner);return json({action,willPublish:false,status:'queued',scheduledAt:post?.scheduledAt,message:'The post is queued for automatic publishing.'});}
  return json({action,willPublish:true,...await dispatchPost(body.id,owner,action==='retry')});
 }catch(error){return json({error:error instanceof Error?error.message:'Publishing could not be prepared.'},400)}
}

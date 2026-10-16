import {env} from 'cloudflare:workers';
import {authenticatedUser} from '@/lib/auth';

export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers});

type D1Result={results?:Record<string,unknown>[]};
type D1Statement={bind:(...values:unknown[])=>D1Statement;all:()=>Promise<D1Result>;first:()=>Promise<Record<string,unknown>|null>;run:()=>Promise<unknown>};
type D1={prepare:(sql:string)=>D1Statement;batch:(statements:D1Statement[])=>Promise<unknown>};
type StageStatus='locked'|'pending'|'in_progress'|'approved'|'needs_attention';
type Stage={key:string;status:StageStatus;notes:string;approvedAt:string|null};
type Body={id?:string;stageKey?:string;status?:StageStatus;notes?:string};
type CreateBody={series?:string;episodeNumber?:number;title?:string;videoUrl?:string;scriptText?:string};

const stageKeys=['source','transcript','zulu','dubs','translations','music_prompt','music','audio','captions','package','bunny','afroreel'] as const;
const episodeSixScript=`EPISODE 6 — FATHER AND SON
EXT. UMLAZI STREET – DAY
KHWEZI walks, phone in hand.
A message appears from an UNKNOWN NUMBER.
I'D LIKE TO SEE YOU. JUST YOU. — D
Khwezi stops.
Looks toward home.
Then types.
WHERE?

EXT. QUIET CAFÉ / OUTDOOR SEATING – LATER
DUMI waits alone.
Khwezi approaches cautiously.
Dumi stands.
For a moment, neither knows what to do.
Then Dumi smiles.
Not Daniel's public smile.
Something warmer.
DUMI
Khwezi.
Hearing his name from his father's mouth lands.
Khwezi sits.
KHWEZI
You remember me?
Dumi almost laughs.
DUMI
You used to sleep with one shoe on.
Khwezi looks at him.
DUMI
Your mother would take it off. You'd wake up screaming until I put it back.
Khwezi can't help it—
A small smile.
Dumi sees it.
His own smile fades with emotion.
DUMI
Look at you.
Khwezi shifts, uncomfortable with the intimacy.
KHWEZI
Why didn't you come back?
Dumi looks away.
For once, no easy answer.
DUMI
I thought about it.
KHWEZI
For fifteen years?
Dumi absorbs that.
DUMI
I don't expect you to forgive me.
A beat.
DUMI
But there's a reason I couldn't come back.
Khwezi waits.
Dumi meets his eyes.
DUMI
Your mother hasn't told you everything.
CUT TO BLACK.`;
const stagesFor=(episodeNumber:number):Stage[]=>stageKeys.map((key,index)=>{
 const sourceApproved=index===0;
 const isEpisodeFiveTranscript=episodeNumber===5&&key==='transcript';
 return {
  key,
  status:sourceApproved?'approved':isEpisodeFiveTranscript?'needs_attention':index===1?'in_progress':'locked',
  notes:sourceApproved
   ?`English render and Episode ${episodeNumber} script located and validated.`
   :isEpisodeFiveTranscript
    ?'Local transcript preflight found a material difference between the supplied script and the rendered dialogue around 41.8–47.6 seconds. Confirm that the render is the source of truth before spending ElevenLabs credits.'
    :'',
  approvedAt:sourceApproved?new Date().toISOString():null,
 };
});
const db=()=>{const value=(env as unknown as {DB?:D1}).DB;if(!value)throw Error('Production storage is unavailable.');return value};

async function ensureTable(database:D1){
 await database.prepare(`CREATE TABLE IF NOT EXISTS production_episodes (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  series TEXT NOT NULL,
  episode_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  drive_folder_id TEXT NOT NULL,
  drive_file_id TEXT NOT NULL,
  source_filename TEXT NOT NULL,
  duration_seconds REAL NOT NULL,
  source_metadata TEXT NOT NULL,
  stages TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
 )`).run();
 await database.prepare(`CREATE INDEX IF NOT EXISTS production_owner_episode_idx ON production_episodes(owner_id,series,episode_number)`).run();
}

function decode(row:Record<string,unknown>){
 let stages:Stage[]=stagesFor(Number(row.episode_number));
 try{const parsed=JSON.parse(String(row.stages)) as Stage[];if(Array.isArray(parsed))stages=parsed}catch{}
 return {
  id:String(row.id),series:String(row.series),episodeNumber:Number(row.episode_number),title:String(row.title),
  driveFolderId:String(row.drive_folder_id),driveFileId:String(row.drive_file_id),sourceFilename:String(row.source_filename),
  durationSeconds:Number(row.duration_seconds),sourceMetadata:JSON.parse(String(row.source_metadata)) as Record<string,unknown>,
  stages,updatedAt:Number(row.updated_at)
 };
}

async function loadOrSeed(database:D1,owner:string){
 const existing=await database.prepare(`SELECT episode_number FROM production_episodes WHERE owner_id=?`).bind(owner).all();
 const numbers=new Set((existing.results??[]).map(row=>Number(row.episode_number)));
 const now=Date.now();
 const seeds=[
  {episodeNumber:4,title:"Her Mother's Land",driveFileId:'1tsXT0nTW7MYNg7sNwAFiDowkRBtjlEh2',sourceFilename:'Season 2 Espisode 4.mp4',durationSeconds:69.6,sourceMetadata:{sha256:'be51bc4197e1040480fcc82f8ed7ed7b7ae3fa16d728ea365130a9702b4ac9d2',video:'H.264 · 1080 × 1920 · 30 fps',audio:'AAC · 48 kHz · stereo',scriptWords:242}},
  {episodeNumber:5,title:'What He Took',driveFileId:'14cArdH4EzhSHUpeUC138AQp7CZWag8hu',sourceFilename:'Season 2 Episode 5.mp4',durationSeconds:58.4,sourceMetadata:{video:'H.264 · 1080 × 1920',audio:'AAC',scriptWords:131,transcriptPreflight:'needs_attention'}},
  {episodeNumber:6,title:'Father and Son',driveFileId:'1oq8fbc1kb4jbYz6MyHMr-jse1uanDSG4',sourceFilename:'Season 2 Episode 6.mp4',durationSeconds:64.0,sourceMetadata:{video:'H.264 · 1080 × 1920 · 30 fps',audio:'AAC · 48 kHz · stereo',scriptWords:158,scriptText:episodeSixScript,transcriptPreflight:'passed_local_review'}},
 ];
 for(const seed of seeds){
  if(numbers.has(seed.episodeNumber)){
   if(seed.episodeNumber===6){
    const row=await database.prepare(`SELECT source_metadata FROM production_episodes WHERE owner_id=? AND episode_number=6`).bind(owner).first();
    try{const metadata=JSON.parse(String(row?.source_metadata??'{}')) as Record<string,unknown>;if(!metadata.scriptText)await database.prepare(`UPDATE production_episodes SET source_metadata=?,updated_at=? WHERE owner_id=? AND episode_number=6`).bind(JSON.stringify({...metadata,scriptText:episodeSixScript}),now,owner).run()}catch{}
   }
   continue;
  }
  await database.prepare(`INSERT INTO production_episodes (id,owner_id,series,episode_number,title,drive_folder_id,drive_file_id,source_filename,duration_seconds,source_metadata,stages,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
   .bind(crypto.randomUUID(),owner,'Series 2',seed.episodeNumber,seed.title,'1GvYcTTmbHOUEQDU0jutZr16h8Rz7scbC',seed.driveFileId,seed.sourceFilename,seed.durationSeconds,JSON.stringify(seed.sourceMetadata),JSON.stringify(stagesFor(seed.episodeNumber)),now,now).run();
 }
 return database.prepare(`SELECT * FROM production_episodes WHERE owner_id=? ORDER BY episode_number DESC`).bind(owner).all();
}

export async function GET(request:Request){
 const owner=authenticatedUser(request);if(!owner)return json({error:'Sign in to view production episodes.'},401);
 try{const database=db();await ensureTable(database);const result=await loadOrSeed(database,owner);const episodes=(result.results??[]).map(decode);return episodes.length?json({episode:episodes[0],episodes}):json({error:'Could not create the production episodes.'},503)}catch{return json({error:'Production workflow could not be loaded.'},503)}
}

export async function POST(request:Request){
 const owner=authenticatedUser(request);if(!owner)return json({error:'Sign in to add a production episode.'},401);
 const body=await request.json().catch(()=>null) as CreateBody|null;
 const episodeNumber=Number(body?.episodeNumber),videoUrl=body?.videoUrl?.trim()??'',scriptText=body?.scriptText?.trim()??'';
 if(!Number.isInteger(episodeNumber)||episodeNumber<1||!body?.title?.trim()||!scriptText||!/^https:\/\//i.test(videoUrl))return json({error:'Episode number, title, HTTPS video URL and script are required.'},400);
 try{
  const database=db();await ensureTable(database);
  const duplicate=await database.prepare(`SELECT id FROM production_episodes WHERE owner_id=? AND series=? AND episode_number=?`).bind(owner,body.series?.trim()||'Series 2',episodeNumber).first();
  if(duplicate)return json({error:'That episode already exists in this series.'},409);
  const driveMatch=videoUrl.match(/\/file\/d\/([^/?]+)/)||videoUrl.match(/[?&]id=([^&]+)/);const driveFileId=driveMatch?.[1]??videoUrl;
  const id=crypto.randomUUID(),now=Date.now();const stages=stagesFor(episodeNumber);stages[0]={...stages[0],notes:'Video and script supplied. Ready for transcript preflight.'};
  const metadata={videoUrl,scriptText,scriptWords:scriptText.split(/\s+/).filter(Boolean).length,transcriptPreflight:'pending'};
  await database.prepare(`INSERT INTO production_episodes (id,owner_id,series,episode_number,title,drive_folder_id,drive_file_id,source_filename,duration_seconds,source_metadata,stages,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,owner,body.series?.trim()||'Series 2',episodeNumber,body.title.trim(),'custom',driveFileId,`Episode ${episodeNumber} source`,0,JSON.stringify(metadata),JSON.stringify(stages),now,now).run();
  const row=await database.prepare(`SELECT * FROM production_episodes WHERE id=? AND owner_id=?`).bind(id,owner).first();return json({episode:decode(row!)},201);
 }catch{return json({error:'The production episode could not be created.'},503)}
}

export async function PATCH(request:Request){
 const owner=authenticatedUser(request);if(!owner)return json({error:'Sign in to update production episodes.'},401);
 const body=await request.json().catch(()=>null) as Body|null;
 if(!body?.id||!body.stageKey||!stageKeys.includes(body.stageKey as typeof stageKeys[number])||!body.status||!['pending','in_progress','approved','needs_attention'].includes(body.status))return json({error:'Episode, stage and valid status are required.'},400);
 try{
  const database=db();await ensureTable(database);const row=await database.prepare(`SELECT * FROM production_episodes WHERE id=? AND owner_id=?`).bind(body.id,owner).first();if(!row)return json({error:'Production episode not found.'},404);
  const episode=decode(row);const index=episode.stages.findIndex(stage=>stage.key===body.stageKey);if(index<0)return json({error:'Workflow stage not found.'},404);
  const stages=episode.stages.map(stage=>({...stage}));
  stages[index]={...stages[index],status:body.status,notes:(body.notes??stages[index].notes).trim(),approvedAt:body.status==='approved'?new Date().toISOString():null};
  if(body.status==='approved'&&stages[index+1]?.status==='locked')stages[index+1]={...stages[index+1],status:'in_progress'};
  const now=Date.now();await database.prepare(`UPDATE production_episodes SET stages=?,updated_at=? WHERE id=? AND owner_id=?`).bind(JSON.stringify(stages),now,body.id,owner).run();
  return json({episode:{...episode,stages,updatedAt:now}});
 }catch{return json({error:'Production stage could not be updated.'},503)}
}

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

const stageKeys=['source','transcript','zulu','dubs','translations','music_prompt','music','audio','captions','package','bunny','afroreel'] as const;
const initialStages:Stage[]=stageKeys.map((key,index)=>({key,status:index===0?'approved':index===1?'in_progress':'locked',notes:index===0?'English render and Episode 4 script validated.':'',approvedAt:index===0?new Date().toISOString():null}));
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
 let stages:Stage[]=initialStages;
 try{const parsed=JSON.parse(String(row.stages)) as Stage[];if(Array.isArray(parsed))stages=parsed}catch{}
 return {
  id:String(row.id),series:String(row.series),episodeNumber:Number(row.episode_number),title:String(row.title),
  driveFolderId:String(row.drive_folder_id),driveFileId:String(row.drive_file_id),sourceFilename:String(row.source_filename),
  durationSeconds:Number(row.duration_seconds),sourceMetadata:JSON.parse(String(row.source_metadata)) as Record<string,unknown>,
  stages,updatedAt:Number(row.updated_at)
 };
}

async function loadOrSeed(database:D1,owner:string){
 let row=await database.prepare(`SELECT * FROM production_episodes WHERE owner_id=? ORDER BY updated_at DESC LIMIT 1`).bind(owner).first();
 if(row)return row;
 const id=crypto.randomUUID(),now=Date.now();
 const sourceMetadata={sha256:'be51bc4197e1040480fcc82f8ed7ed7b7ae3fa16d728ea365130a9702b4ac9d2',video:'H.264 · 1080 × 1920 · 30 fps',audio:'AAC · 48 kHz · stereo',scriptWords:242};
 await database.prepare(`INSERT INTO production_episodes (id,owner_id,series,episode_number,title,drive_folder_id,drive_file_id,source_filename,duration_seconds,source_metadata,stages,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
  .bind(id,owner,'Series 2',4,"Her Mother's Land",'1GvYcTTmbHOUEQDU0jutZr16h8Rz7scbC','1tsXT0nTW7MYNg7sNwAFiDowkRBtjlEh2','Season 2 Espisode 4.mp4',69.6,JSON.stringify(sourceMetadata),JSON.stringify(initialStages),now,now).run();
 row=await database.prepare(`SELECT * FROM production_episodes WHERE id=?`).bind(id).first();
 return row;
}

export async function GET(request:Request){
 const owner=authenticatedUser(request);if(!owner)return json({error:'Sign in to view production episodes.'},401);
 try{const database=db();await ensureTable(database);const row=await loadOrSeed(database,owner);return row?json({episode:decode(row)}):json({error:'Could not create the test episode.'},503)}catch{return json({error:'Production workflow could not be loaded.'},503)}
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

import {env} from 'cloudflare:workers';
import {authenticatedUser} from '@/lib/auth';

export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers});
type Statement={bind:(...values:unknown[])=>Statement;first:()=>Promise<Record<string,unknown>|null>};
type D1={prepare:(sql:string)=>Statement};
type Segment={id?:string;text:string;start_s:number;end_s:number};
type Project={project_id:string;status?:string;reference?:string;media?:{filename?:string;duration_s?:number}};
type Difference={type:'changed'|'added'|'missing';expected?:string;heard?:string;segment:number};

const normalizeWord=(word:string)=>word.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9']/g,'').replace(/^'+|'+$/g,'');
const words=(text:string)=>text.split(/\s+/).map(normalizeWord).filter(Boolean);
const key=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]/g,'');
const time=(seconds:number)=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;

function dialogue(script:string){
 const lines=script.replace(/\r/g,'').split('\n').map(line=>line.trim());
 const spoken:string[]=[];let expecting=false;
 for(const line of lines){
  if(!line){expecting=false;continue}
  if(/^\(.*\)$/.test(line))continue;
  const cue=/^[A-Z][A-Z .'’-]{1,35}$/.test(line)&&!line.startsWith('INT.')&&!line.startsWith('EXT.')&&!line.startsWith('EPISODE')&&!line.startsWith('CUT TO');
  if(cue){expecting=true;continue}
  if(expecting){spoken.push(line);expecting=false}
 }
 return spoken.join(' ');
}

function align(scriptText:string,segments:Segment[]){
 const expected=words(dialogue(scriptText));
 const heard:{word:string;segment:number}[]=[];
 segments.forEach((segment,index)=>words(segment.text).forEach(word=>heard.push({word,segment:index})));
 const n=expected.length,m=heard.length,dp=Array.from({length:n+1},()=>new Uint16Array(m+1));
 for(let i=0;i<=n;i++)dp[i][0]=i;for(let j=0;j<=m;j++)dp[0][j]=j;
 for(let i=1;i<=n;i++)for(let j=1;j<=m;j++)dp[i][j]=Math.min(dp[i-1][j]+1,dp[i][j-1]+1,dp[i-1][j-1]+(expected[i-1]===heard[j-1].word?0:1));
 const differences:Difference[]=[];let matched=0,i=n,j=m;
 while(i||j){
  if(i&&j&&expected[i-1]===heard[j-1].word&&dp[i][j]===dp[i-1][j-1]){matched++;i--;j--;continue}
  if(i&&j&&dp[i][j]===dp[i-1][j-1]+1){differences.push({type:'changed',expected:expected[i-1],heard:heard[j-1].word,segment:heard[j-1].segment});i--;j--;continue}
  if(j&&dp[i][j]===dp[i][j-1]+1){differences.push({type:'added',heard:heard[j-1].word,segment:heard[j-1].segment});j--;continue}
  differences.push({type:'missing',expected:expected[i-1],segment:j?heard[j-1].segment:0});i--;
 }
 differences.reverse();
 const grouped=new Map<number,Difference[]>();for(const difference of differences){const list=grouped.get(difference.segment)??[];list.push(difference);grouped.set(difference.segment,list)}
 const review=[...grouped.entries()].map(([segmentIndex,items])=>{const segment=segments[segmentIndex]??segments[0];return {start:segment?.start_s??0,end:segment?.end_s??0,timestamp:`${time(segment?.start_s??0)}–${time(segment?.end_s??0)}`,transcript:segment?.text??'',differences:items.map(item=>({type:item.type,expected:item.expected,heard:item.heard}))}});
 return {scriptWords:expected.length,transcriptWords:heard.length,matchedWords:matched,accuracyPct:expected.length?Math.round((matched/Math.max(expected.length,heard.length))*100):0,issueCount:differences.length,review};
}

export async function GET(request:Request){
 const owner=authenticatedUser(request);if(!owner)return json({error:'Sign in to compare transcripts.'},401);
 const episodeId=new URL(request.url).searchParams.get('episodeId');if(!episodeId)return json({error:'Select an episode first.'},400);
 const database=(env as unknown as {DB?:D1}).DB,keyValue=(env as unknown as {ELEVENLABS_API_KEY?:string}).ELEVENLABS_API_KEY;
 if(!database||!keyValue)return json({error:'Production storage or ElevenLabs is not configured.'},503);
 const episode=await database.prepare(`SELECT * FROM production_episodes WHERE id=? AND owner_id=?`).bind(episodeId,owner).first();if(!episode)return json({error:'Production episode not found.'},404);
 let scriptText='';try{scriptText=String((JSON.parse(String(episode.source_metadata)) as {scriptText?:string}).scriptText??'')}catch{}
 if(!scriptText)return json({error:'The saved episode does not contain its source script yet.'},409);
 const listResponse=await fetch('https://api.elevenlabs.io/v1/dubbing/project?page_size=100&sort_direction=DESCENDING',{headers:{'xi-api-key':keyValue}});
 const list=await listResponse.json().catch(()=>({})) as {projects?:Project[];dubbing_projects?:Project[]};if(!listResponse.ok)return json({error:`ElevenLabs project lookup failed (${listResponse.status}).`},502);
 const projects=list.projects??list.dubbing_projects??[],filename=String(episode.source_filename),episodeNumber=Number(episode.episode_number);
 const project=projects.find(item=>key(item.media?.filename??'')===key(filename))??projects.find(item=>new RegExp(`(?:episode|ep)\\s*${episodeNumber}\\b`,'i').test(`${item.media?.filename??''} ${item.reference??''}`));
 if(!project)return json({error:`No ElevenLabs project matching ${filename} was found.`},404);
 const transcriptResponse=await fetch(`https://api.elevenlabs.io/v1/dubbing/project/${encodeURIComponent(project.project_id)}/transcript`,{headers:{'xi-api-key':keyValue}});
 const transcript=await transcriptResponse.json().catch(()=>({})) as {segments?:Array<{id?:string;text?:string;start_s?:number;end_s?:number}>};
 if(!transcriptResponse.ok||!Array.isArray(transcript.segments))return json({ready:false,project:{id:project.project_id,status:project.status??'processing',filename:project.media?.filename??filename},message:'ElevenLabs has not made the source transcript available yet. Try again when generation finishes.'});
 const segments:Segment[]=transcript.segments.map(segment=>({id:segment.id,text:segment.text??'',start_s:Number(segment.start_s??0),end_s:Number(segment.end_s??0)}));
 return json({ready:true,project:{id:project.project_id,status:project.status??'ready',filename:project.media?.filename??filename},...align(scriptText,segments),segments:segments.length,readOnly:true});
}

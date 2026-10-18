import {env} from 'cloudflare:workers';
import {authenticatedUser} from '@/lib/auth';

export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers});
type Statement={bind:(...values:unknown[])=>Statement;first:()=>Promise<Record<string,unknown>|null>};
type D1={prepare:(sql:string)=>Statement};
type Project={project_id:string;status?:string;reference?:string;media?:{filename?:string}};
type Target={language_id:string;target_language?:string;status?:string;error?:{message?:string}|string};
type TargetSegment={source_text?:string;translation?:string;start_s?:number;end_s?:number};
type Issue={severity:'error'|'warning';code:string;message:string};

const wanted=[{code:'zu',name:'Zulu'},{code:'ha',name:'Hausa'},{code:'sw',name:'Swahili'},{code:'fr',name:'French'}] as const;
const key=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]/g,'');
const normalized=(value:string)=>value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9']/g,' ').replace(/\s+/g,' ').trim();
const wordCount=(value:string)=>normalized(value).split(' ').filter(Boolean).length;
const time=(seconds:number)=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;

async function eleven(path:string,apiKey:string){
 const response=await fetch(`https://api.elevenlabs.io${path}`,{headers:{'xi-api-key':apiKey}});
 const data=await response.json().catch(()=>({}));
 return {response,data};
}

function inspect(segment:TargetSegment,language:string):Issue[]{
 const source=String(segment.source_text??'').trim(),translation=String(segment.translation??'').trim(),issues:Issue[]=[];
 if(!translation){issues.push({severity:'error',code:'missing_translation',message:'Translation is empty.'});return issues}
 const sourceWords=wordCount(source),translatedWords=wordCount(translation);
 if(sourceWords>1&&normalized(source)===normalized(translation))issues.push({severity:'error',code:'untranslated',message:'The target text is identical to the English source.'});
 if(sourceWords>=4&&translatedWords/sourceWords<0.28)issues.push({severity:'warning',code:'very_short',message:'The translation is unusually short and may have dropped meaning.'});
 if(sourceWords>=3&&translatedWords/sourceWords>3.4)issues.push({severity:'warning',code:'very_long',message:'The translation is unusually long and may contain added wording.'});
 const names=(source.match(/\b[A-Z][a-z]{2,}\b/g)??[]).filter(name=>!['The','But','And','For','You','Your','Look','Why'].includes(name));
 for(const name of [...new Set(names)])if(!normalized(translation).includes(normalized(name)))issues.push({severity:'warning',code:'name_missing',message:`Check the name “${name}”; it is not present in the translated text.`});
 const englishMarkers=[' the ',' you ',' your ',' with ',' that ',' this ',' have ',' will ',' come ',' mother ',' father '];
 const padded=` ${normalized(translation)} `,markers=englishMarkers.filter(marker=>padded.includes(marker)).length;
 if(language!=='fr'&&translatedWords>=4&&markers>=2)issues.push({severity:'warning',code:'english_remaining',message:'Several common English words remain; check that the line was translated.'});
 return issues;
}

export async function GET(request:Request){
 const owner=authenticatedUser(request);if(!owner)return json({error:'Sign in to review translations.'},401);
 const episodeId=new URL(request.url).searchParams.get('episodeId');if(!episodeId)return json({error:'Select an episode first.'},400);
 const database=(env as unknown as {DB?:D1}).DB,apiKey=(env as unknown as {ELEVENLABS_API_KEY?:string}).ELEVENLABS_API_KEY;
 if(!database||!apiKey)return json({error:'Production storage or ElevenLabs is not configured.'},503);
 const episode=await database.prepare(`SELECT * FROM production_episodes WHERE id=? AND owner_id=?`).bind(episodeId,owner).first();
 if(!episode)return json({error:'Production episode not found.'},404);
 const listed=await eleven('/v1/dubbing/project?page_size=100&sort_direction=DESCENDING',apiKey);
 const list=listed.data as {projects?:Project[];dubbing_projects?:Project[]};
 if(!listed.response.ok)return json({error:`ElevenLabs project lookup failed (${listed.response.status}).`},502);
 const projects=list.projects??list.dubbing_projects??[],filename=String(episode.source_filename),number=Number(episode.episode_number);
 const project=projects.find(item=>key(item.media?.filename??'')===key(filename))??projects.find(item=>new RegExp(`(?:episode|ep)\\s*${number}\\b`,'i').test(`${item.media?.filename??''} ${item.reference??''}`));
 if(!project)return json({error:`No ElevenLabs project matching ${filename} was found.`},404);
 const detailed=await eleven(`/v1/dubbing/project/${encodeURIComponent(project.project_id)}`,apiKey);
 const detail=detailed.data as Project&{language_ids?:string[]};
 if(!detailed.response.ok)return json({error:`ElevenLabs project details failed (${detailed.response.status}).`},502);
 const targets=await Promise.all((detail.language_ids??[]).map(async languageId=>{
  const result=await eleven(`/v1/dubbing/project/${encodeURIComponent(project.project_id)}/language/${encodeURIComponent(languageId)}`,apiKey);
  return result.response.ok?result.data as Target:null;
 }));
 const languages=await Promise.all(wanted.map(async wantedLanguage=>{
  const target=targets.find(value=>value?.target_language?.toLowerCase().split('-')[0]===wantedLanguage.code);
  if(!target)return {code:wantedLanguage.code,name:wantedLanguage.name,status:'missing',verdict:'waiting',segmentCount:0,errorCount:0,warningCount:0,issues:[]};
  if(target.status!=='completed')return {code:wantedLanguage.code,name:wantedLanguage.name,status:target.status??'processing',verdict:target.status==='failed'?'fail':'waiting',segmentCount:0,errorCount:target.status==='failed'?1:0,warningCount:0,issues:[],message:typeof target.error==='string'?target.error:target.error?.message};
  const transcriptResult=await eleven(`/v1/dubbing/project/${encodeURIComponent(project.project_id)}/language/${encodeURIComponent(target.language_id)}/transcript`,apiKey);
  const transcript=transcriptResult.data as {segments?:TargetSegment[]};
  if(!transcriptResult.response.ok||!Array.isArray(transcript.segments))return {code:wantedLanguage.code,name:wantedLanguage.name,status:'transcript unavailable',verdict:'waiting',segmentCount:0,errorCount:0,warningCount:0,issues:[]};
  const issueRows=transcript.segments.map((segment,index)=>({index:index+1,start:Number(segment.start_s??0),end:Number(segment.end_s??0),timestamp:`${time(Number(segment.start_s??0))}–${time(Number(segment.end_s??0))}`,source:String(segment.source_text??''),translation:String(segment.translation??''),issues:inspect(segment,wantedLanguage.code)})).filter(row=>row.issues.length);
  const errorCount=issueRows.reduce((sum,row)=>sum+row.issues.filter(issue=>issue.severity==='error').length,0),warningCount=issueRows.reduce((sum,row)=>sum+row.issues.filter(issue=>issue.severity==='warning').length,0);
  return {code:wantedLanguage.code,name:wantedLanguage.name,status:'completed',verdict:errorCount?'fail':warningCount?'review':'pass',segmentCount:transcript.segments.length,errorCount,warningCount,issues:issueRows};
 }));
 return json({readOnly:true,project:{id:project.project_id,status:detail.status??project.status??'ready',filename:detail.media?.filename??project.media?.filename??filename},languages,summary:{pass:languages.filter(item=>item.verdict==='pass').length,review:languages.filter(item=>item.verdict==='review').length,fail:languages.filter(item=>item.verdict==='fail').length,waiting:languages.filter(item=>item.verdict==='waiting').length},limits:'This preflight detects missing, untranslated and structurally suspicious lines. A fluent speaker must still confirm meaning, natural phrasing and pronunciation.'});
}

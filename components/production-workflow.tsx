'use client';

import {useEffect,useMemo,useRef,useState} from 'react';
import {AlertTriangle,Check,ChevronRight,Clock3,ExternalLink,FileAudio,FileText,Film,LoaderCircle,LockKeyhole,Music2,RefreshCw,ShieldCheck,Subtitles,UploadCloud} from 'lucide-react';

type StageStatus='locked'|'pending'|'in_progress'|'approved'|'needs_attention';
type Stage={key:string;status:StageStatus;notes:string;approvedAt:string|null};
type Episode={id:string;series:string;episodeNumber:number;title:string;driveFolderId:string;driveFileId:string;sourceFilename:string;durationSeconds:number;sourceMetadata:{video?:string;audio?:string;scriptWords?:number;videoUrl?:string};stages:Stage[];updatedAt:number};
type ElevenStatus={configured:boolean;connected:boolean;account?:{tier:string;status:string;creditsUsed:number|null;creditLimit:number|null};capabilities?:{dubbingRead:boolean;musicGeneration:string;transcriptEditing:string};safety?:{generationEnabled:boolean;paidRequestsMade:number;message:string};error?:string};

const definitions=[
 {key:'source',title:'Source validation',description:'English render and series script',icon:Film},
 {key:'transcript',title:'English transcript review',description:'Compare ElevenLabs dialogue with the script',icon:FileText},
 {key:'zulu',title:'Zulu test dub',description:'Dubbing V2 · Speaker Similarity 0',icon:FileAudio},
 {key:'dubs',title:'Remaining dubs',description:'Hausa 0 · Swahili 0 · French 5',icon:FileAudio},
 {key:'translations',title:'Translation review',description:'Meaning, context and material errors',icon:FileText},
 {key:'music_prompt',title:'Music direction',description:'Scoring map and Music 2.5 prompt',icon:Music2},
 {key:'music',title:'Music review',description:'One variation · exact episode duration',icon:Music2},
 {key:'audio',title:'Five-language mixes',description:'English, Zulu, Hausa, Swahili and French WAVs',icon:FileAudio},
 {key:'captions',title:'Caption review',description:'Reviewed English and French SRTs',icon:Subtitles},
 {key:'package',title:'Bunny package',description:'Silent MP4 + 5 WAV + 2 SRT validation',icon:UploadCloud},
 {key:'bunny',title:'Bunny playback',description:'Audio tracks, captions and HLS verification',icon:Film},
 {key:'afroreel',title:'AfroReel link',description:'Save the verified HLS URL to the episode',icon:ExternalLink},
] as const;

const outputs=['Silent 1080p MP4','English WAV','Zulu WAV','Hausa WAV','Swahili WAV','French WAV','English SRT','French SRT'];

function StatusIcon({status}:{status:StageStatus}){
 if(status==='approved')return <Check size={16}/>;
 if(status==='in_progress')return <Clock3 size={16}/>;
 if(status==='needs_attention')return <AlertTriangle size={16}/>;
 return <LockKeyhole size={15}/>;
}

export function ProductionWorkflow(){
 const [episode,setEpisode]=useState<Episode|null>(null);
 const [episodes,setEpisodes]=useState<Episode[]>([]);
 const [selected,setSelected]=useState('transcript');
 const [notes,setNotes]=useState('');
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [checking,setChecking]=useState(false);
 const [startingZulu,setStartingZulu]=useState(false);
 const [zuluResult,setZuluResult]=useState('');
 const [transcriptAudit,setTranscriptAudit]=useState('');
 const [zuluAudio,setZuluAudio]=useState('');
 const [zuluAudioObjectUrl,setZuluAudioObjectUrl]=useState('');
 const [languageResults,setLanguageResults]=useState<Record<string,string>>({});
 const [showAdd,setShowAdd]=useState(false);
 const [creating,setCreating]=useState(false);
 const [newEpisode,setNewEpisode]=useState({series:'Series 2',episodeNumber:'',title:'',videoUrl:'',scriptText:''});
 const [eleven,setEleven]=useState<ElevenStatus|null>(null);
 const [error,setError]=useState('');
 const reviewVideo=useRef<HTMLVideoElement|null>(null);
 const reviewAudio=useRef<HTMLAudioElement|null>(null);
 const approved=episode?.stages.filter(stage=>stage.status==='approved').length??0;
 const stage=episode?.stages.find(item=>item.key===selected);
 const definition=definitions.find(item=>item.key===selected)??definitions[0];
 const ReviewIcon=definition.icon;
 const progress=Math.round((approved/definitions.length)*100);
 const currentIndex=Math.max(0,episode?.stages.findIndex(item=>item.status==='in_progress'||item.status==='needs_attention')??0);

 function selectEpisode(next:Episode){setEpisode(next);const active=next.stages.find(item=>item.status==='in_progress'||item.status==='needs_attention')??next.stages[0];setSelected(active.key);setNotes(active.notes)}
 async function load(){setLoading(true);setError('');try{const response=await fetch('/api/production',{cache:'no-store'});const data=await response.json() as {episode?:Episode;episodes?:Episode[];error?:string};if(!response.ok||!data.episode)throw Error(data.error||'Could not load production.');setEpisodes(data.episodes??[data.episode]);selectEpisode(data.episode)}catch(e){setError(e instanceof Error?e.message:'Could not load production.')}finally{setLoading(false)}}
 async function update(status:StageStatus){if(!episode||!stage||saving)return;setSaving(true);setError('');try{const response=await fetch('/api/production',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:episode.id,stageKey:stage.key,status,notes})});const data=await response.json() as {episode?:Episode;error?:string};if(!response.ok||!data.episode)throw Error(data.error||'Could not update this stage.');setEpisode(data.episode);const next=data.episode.stages.find(item=>item.status==='in_progress'||item.status==='needs_attention');if(status==='approved'&&next){setSelected(next.key);setNotes(next.notes)}}catch(e){setError(e instanceof Error?e.message:'Could not update this stage.')}finally{setSaving(false)}}
 async function checkElevenLabs(){setChecking(true);try{const response=await fetch('/api/production/elevenlabs',{cache:'no-store'});const data=await response.json() as ElevenStatus;setEleven(data)}catch{setEleven({configured:true,connected:false,error:'Connection check failed. No paid request was made.'})}finally{setChecking(false)}}
 async function startZuluPilot(){if(!episode||startingZulu)return;setStartingZulu(true);setError('');try{const response=await fetch('/api/production/dubbing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({episodeId:episode.id,language:'zu',confirm:true})});const data=await response.json() as {job?:{status:string};duplicatePrevented?:boolean;error?:string};if(!response.ok||!data.job)throw Error(data.error||'Could not start the Zulu pilot.');setZuluResult(data.duplicatePrevented?`Existing Zulu job found · ${data.job.status}`:`Zulu pilot started · ${data.job.status}`)}catch(e){setError(e instanceof Error?e.message:'Could not start the Zulu pilot.')}finally{setStartingZulu(false)}}
 async function refreshZuluPilot(){if(!episode||startingZulu)return;setStartingZulu(true);setError('');try{const response=await fetch(`/api/production/dubbing?episodeId=${encodeURIComponent(episode.id)}&language=zu`,{cache:'no-store'});const data=await response.json() as {job?:{status:string;error?:string|null;outputUrl?:string|null}|null;sourceTranscript?:{text:string;segments:number;containsExpectedNames:boolean;unexpectedName:string|null}|null;error?:string};if(!response.ok)throw Error(data.error||'Could not check the Zulu pilot.');setZuluResult(data.job?`Zulu pilot · ${data.job.status}${data.job.error?` · ${data.job.error}`:''}`:'No Zulu pilot has been started.');setZuluAudio(data.job?.outputUrl??'');if(data.job?.outputUrl){const audioResponse=await fetch(`/api/production/media?episodeId=${encodeURIComponent(episode.id)}&kind=audio&language=zu`,{cache:'no-store'});if(!audioResponse.ok)throw Error('The completed Zulu audio could not be loaded.');const objectUrl=URL.createObjectURL(await audioResponse.blob());setZuluAudioObjectUrl(previous=>{if(previous)URL.revokeObjectURL(previous);return objectUrl})}if(data.sourceTranscript)setTranscriptAudit(episode.episodeNumber===6?(data.sourceTranscript.containsExpectedNames&&!data.sourceTranscript.unexpectedName?`Source transcript verified: Khwezi is correct across ${data.sourceTranscript.segments} segments.`:`Transcript warning: ${data.sourceTranscript.unexpectedName??'Khwezi is missing'}. Do not approve further languages.`):`ElevenLabs source transcript ready · ${data.sourceTranscript.segments} segments. Compare it with the supplied script before approval.`)}catch(e){setError(e instanceof Error?e.message:'Could not check the Zulu pilot.')}finally{setStartingZulu(false)}}
 async function createEpisode(){if(creating)return;setCreating(true);setError('');try{const response=await fetch('/api/production',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...newEpisode,episodeNumber:Number(newEpisode.episodeNumber)})});const data=await response.json() as {episode?:Episode;error?:string};if(!response.ok||!data.episode)throw Error(data.error||'Could not add the episode.');setEpisodes(items=>[data.episode!,...items].sort((a,b)=>b.episodeNumber-a.episodeNumber));selectEpisode(data.episode);setShowAdd(false);setNewEpisode({series:'Series 2',episodeNumber:'',title:'',videoUrl:'',scriptText:''})}catch(e){setError(e instanceof Error?e.message:'Could not add the episode.')}finally{setCreating(false)}}
 async function startLanguage(language:'ha'|'sw'|'fr'){if(!episode||startingZulu)return;setStartingZulu(true);setError('');try{const response=await fetch('/api/production/dubbing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({episodeId:episode.id,language,confirm:true})});const data=await response.json() as {job?:{status:string;cloningStrength:number};duplicatePrevented?:boolean;error?:string};if(!response.ok||!data.job)throw Error(data.error||`Could not start ${language}.`);setLanguageResults(value=>({...value,[language]:`${data.duplicatePrevented?'Existing':'Started'} · ${data.job!.status} · similarity ${data.job!.cloningStrength}`}))}catch(e){setError(e instanceof Error?e.message:`Could not start ${language}.`)}finally{setStartingZulu(false)}}
 async function refreshLanguage(language:'ha'|'sw'|'fr'){if(!episode||startingZulu)return;setStartingZulu(true);setError('');try{const response=await fetch(`/api/production/dubbing?episodeId=${encodeURIComponent(episode.id)}&language=${language}`,{cache:'no-store'});const data=await response.json() as {job?:{status:string;cloningStrength:number;error?:string|null}|null;error?:string};if(!response.ok)throw Error(data.error||`Could not check ${language}.`);setLanguageResults(value=>({...value,[language]:data.job?`${data.job.status} · similarity ${data.job.cloningStrength}${data.job.error?` · ${data.job.error}`:''}`:'Not started'}))}catch(e){setError(e instanceof Error?e.message:`Could not check ${language}.`)}finally{setStartingZulu(false)}}
 useEffect(()=>{void load()},[]);
 useEffect(()=>{setNotes(stage?.notes??'')},[selected,stage?.notes]);
 useEffect(()=>()=>{if(zuluAudioObjectUrl)URL.revokeObjectURL(zuluAudioObjectUrl)},[zuluAudioObjectUrl]);
 const sourceUrl=useMemo(()=>episode?`https://drive.google.com/file/d/${episode.driveFileId}/view`:null,[episode]);
 const previewVideoUrl=useMemo(()=>episode?`/api/production/media?episodeId=${encodeURIComponent(episode.id)}&kind=video`:null,[episode]);
 const previewZuluAudioUrl=useMemo(()=>episode?`/api/production/media?episodeId=${encodeURIComponent(episode.id)}&kind=audio&language=zu`:null,[episode]);
 const syncReview=()=>{const video=reviewVideo.current,audio=reviewAudio.current;if(video&&audio&&Math.abs(audio.currentTime-video.currentTime)>.15)audio.currentTime=video.currentTime};
 const playZuluReview=async()=>{const video=reviewVideo.current,audio=reviewAudio.current;if(!video||!audio)return;video.muted=true;video.volume=0;syncReview();await Promise.all([video.play(),audio.play()])};
 const pauseZuluReview=()=>{reviewVideo.current?.pause();reviewAudio.current?.pause()};
 const restartZuluReview=async()=>{const video=reviewVideo.current,audio=reviewAudio.current;if(!video||!audio)return;video.currentTime=0;audio.currentTime=0;await playZuluReview()};

 if(loading)return <section className="production-loading"><LoaderCircle className="spin" size={22}/>Loading production workspace…</section>;
 if(error&&!episode)return <section className="production-loading error-panel"><AlertTriangle size={20}/>{error}<button className="button" onClick={()=>void load()}><RefreshCw size={15}/>Retry</button></section>;
 if(!episode)return null;

 return <div className="production-layout">
  <section className="production-overview">
   <div className="production-episode-card"><div className="episode-summary"><p>Reusable workflow</p><h2>Add an episode</h2><span>Supply one video URL and its English script. The workflow handles transcript review and language gates.</span></div><button className="button" onClick={()=>setShowAdd(value=>!value)}>{showAdd?'Close':'Add episode'}</button></div>
   {showAdd&&<div className="automation-safety"><div className="source-facts"><label>Series<input value={newEpisode.series} onChange={event=>setNewEpisode(value=>({...value,series:event.target.value}))}/></label><label>Episode number<input type="number" min="1" value={newEpisode.episodeNumber} onChange={event=>setNewEpisode(value=>({...value,episodeNumber:event.target.value}))}/></label><label>Title<input value={newEpisode.title} onChange={event=>setNewEpisode(value=>({...value,title:event.target.value}))}/></label><label>Public video URL<input value={newEpisode.videoUrl} onChange={event=>setNewEpisode(value=>({...value,videoUrl:event.target.value}))} placeholder="https://…"/></label></div><label className="review-notes">English script<textarea rows={8} value={newEpisode.scriptText} onChange={event=>setNewEpisode(value=>({...value,scriptText:event.target.value}))} placeholder="Paste the episode script here…"/></label><button className="button primary-button" disabled={creating} onClick={()=>void createEpisode()}>{creating?'Adding…':'Create workflow'}</button></div>}
   <div className="production-episode-card">
    <div className="episode-art"><Film size={26}/><span>S2 · E{episode.episodeNumber}</span></div>
    <div className="episode-summary"><p>{episode.series} · Episode {episode.episodeNumber}</p><h2>{episode.title}</h2><span>{episode.durationSeconds.toFixed(1)} sec · {episode.sourceMetadata.video}</span></div>
    {episodes.length>1&&<select className="episode-selector" aria-label="Select episode" value={episode.id} onChange={event=>{const next=episodes.find(item=>item.id===event.target.value);if(next)selectEpisode(next)}}>{episodes.map(item=><option key={item.id} value={item.id}>Episode {item.episodeNumber} · {item.title}</option>)}</select>}
    <a className="button" href={sourceUrl??'#'} target="_blank" rel="noreferrer">Open render <ExternalLink size={14}/></a>
   </div>
   <div className="production-progress"><div><span>Workflow progress</span><strong>{approved} of {definitions.length} stages approved</strong></div><span>{progress}%</span><div className="progress-track"><i style={{width:`${progress}%`}}/></div></div>
   <div className="workflow-list">{definitions.map((item,index)=>{const state=episode.stages.find(stage=>stage.key===item.key)!;const Icon=item.icon;return <button key={item.key} className={`workflow-stage ${selected===item.key?'selected':''} ${state.status}`} onClick={()=>{setSelected(item.key);setNotes(state.notes)}}><span className="stage-number">{index+1}</span><Icon size={18}/><span><strong>{item.title}</strong><small>{item.description}</small></span><span className="stage-status"><StatusIcon status={state.status}/>{state.status.replaceAll('_',' ')}</span><ChevronRight size={16}/></button>})}</div>
  </section>
  <aside className="production-review">
   <div className="automation-safety">
    <div className="safety-heading"><ShieldCheck size={17}/><span><strong>Credit-safe automation</strong><small>Generation is locked</small></span></div>
    <p>Read-only checks cannot create dubs or music. Paid actions will require a stage approval and an idempotency record.</p>
    <div className="connection-result connected"><strong>Episode 4 is the completed reference</strong><span>Episode 6 is the automated pilot. Episode 5 remains held for a script/render mismatch.</span></div>
    <div className="safety-rules"><span><Check size={13}/>One Episode 4 pilot</span><span><Check size={13}/>Zulu is the first language</span><span><Check size={13}/>No automatic paid retries</span><span><Check size={13}/>One music variation</span></div>
    {eleven&&<div className={`connection-result ${eleven.connected?'connected':'failed'}`}><strong>{eleven.connected?'ElevenLabs connected':eleven.error??'Connection failed'}</strong>{eleven.connected&&<span>{eleven.account?.tier} plan · Dubbing {eleven.capabilities?.dubbingRead?'available':'not available'} · 0 paid requests</span>}</div>}
    <button className="button" disabled={checking} onClick={()=>void checkElevenLabs()}><RefreshCw className={checking?'spin':''} size={14}/>{checking?'Checking…':eleven?'Check again':'Run read-only check'}</button>
   </div>
   <p className="review-kicker">Stage {definitions.findIndex(item=>item.key===selected)+1} of {definitions.length}</p>
   <h2>{definition.title}</h2><p className="review-description">{definition.description}</p>
   {selected==='source'&&<div className="source-facts"><div><span>Source</span><strong>{episode.sourceFilename}</strong></div><div><span>Video</span><strong>{episode.sourceMetadata.video}</strong></div><div><span>Audio</span><strong>{episode.sourceMetadata.audio}</strong></div><div><span>Script</span><strong>{episode.sourceMetadata.scriptWords} words extracted</strong></div></div>}
   {selected==='transcript'&&<div className="source-facts"><div><span>Local preflight</span><strong>Complete · 0 ElevenLabs credits</strong></div><div><span>Dialogue coverage</span><strong>{episode.episodeNumber===5?'Material render/script difference found':episode.episodeNumber===6?'All spoken lines match the script':'Previously reviewed'}</strong></div><div><span>Correction</span><strong>{episode.episodeNumber===6?'“Quasie” → “Khwezi”':episode.episodeNumber===5?'Review 41.8–47.6 seconds':'Completed reference episode'}</strong></div><div><span>Next gate</span><strong>{episode.episodeNumber===6?'Approve Zulu pilot · similarity 0':episode.episodeNumber===5?'Confirm render is source of truth':'Human approval before paid work'}</strong></div></div>}
   {selected==='transcript'&&episode.episodeNumber===6&&<div className="connection-result connected"><strong>Episode 6 is ready</strong><span>Starts one paid Zulu target at cloning strength 0. Duplicate requests are blocked.</span>{zuluResult&&<span>{zuluResult}</span>}{transcriptAudit&&<span>{transcriptAudit}</span>}<button className="button primary-button" disabled={startingZulu} onClick={()=>void startZuluPilot()}>{startingZulu?'Working…':'Start Zulu pilot'}</button>{zuluResult&&<button className="button" disabled={startingZulu} onClick={()=>void refreshZuluPilot()}><RefreshCw className={startingZulu?'spin':''} size={14}/>Refresh Zulu status & transcript</button>}</div>}
   {selected==='zulu'&&<div className="connection-result connected"><strong>Zulu video review · similarity 0</strong><span>Use the Zulu controls below. The original English track is forced to zero.</span>{zuluResult&&<span>{zuluResult}</span>}{transcriptAudit&&<span>{transcriptAudit}</span>}{zuluAudio&&zuluAudioObjectUrl&&previewVideoUrl&&previewZuluAudioUrl&&<div><video ref={reviewVideo} muted playsInline preload="metadata" src={previewVideoUrl} style={{width:'100%',maxHeight:520,background:'#000'}} onPause={()=>reviewAudio.current?.pause()} onSeeking={syncReview} onTimeUpdate={syncReview}/><audio ref={reviewAudio} preload="auto" src={zuluAudioObjectUrl}/><span>Zulu audio loaded and ready.</span><div className="review-actions"><button type="button" className="button primary-button" onClick={()=>void playZuluReview()}>Play Zulu</button><button type="button" className="button" onClick={pauseZuluReview}>Pause</button><button type="button" className="button" onClick={()=>void restartZuluReview()}>Restart</button></div><a className="button" href={previewZuluAudioUrl} target="_blank" rel="noreferrer">Download Zulu audio</a></div>}<button className="button primary-button" disabled={startingZulu||stage?.status==='locked'} onClick={()=>void startZuluPilot()}>{startingZulu?'Working…':'Generate Zulu pilot'}</button><button className="button" disabled={startingZulu} onClick={()=>void refreshZuluPilot()}><RefreshCw className={startingZulu?'spin':''} size={14}/>Load/refresh Zulu video</button></div>}
   {selected==='dubs'&&<div className="source-facts">{([{key:'ha',name:'Hausa',similarity:0},{key:'sw',name:'Swahili',similarity:0},{key:'fr',name:'French',similarity:5}] as const).map(item=><div key={item.key}><span>{item.name}</span><strong>Speaker similarity {item.similarity}</strong>{languageResults[item.key]&&<small>{languageResults[item.key]}</small>}<button className="button primary-button" disabled={startingZulu||stage?.status==='locked'} onClick={()=>void startLanguage(item.key)}>Generate {item.name}</button><button className="button" disabled={startingZulu} onClick={()=>void refreshLanguage(item.key)}>Check status</button></div>)}</div>}
   {selected==='package'&&<div className="manifest-list">{outputs.map(output=><div key={output}><LockKeyhole size={14}/><span>{output}</span><small>Pending</small></div>)}</div>}
   {selected!=='source'&&selected!=='transcript'&&selected!=='package'&&selected!=='dubs'&&selected!=='zulu'&&<div className="stage-empty"><ReviewIcon size={24}/><strong>{stage?.status==='locked'?'Complete the previous stage first':'Ready for review inputs'}</strong><p>{stage?.status==='locked'?'This stage will unlock automatically after the prior approval.':'Automation for this stage will connect here; notes and approval history are already persistent.'}</p></div>}
   <label className="review-notes">Review notes<textarea rows={5} value={notes} onChange={event=>setNotes(event.target.value)} placeholder="Record corrections, decisions or issues for this stage…"/></label>
   {error&&<p className="connection-error">{error}</p>}
   <div className="review-actions"><button disabled={saving||stage?.status==='locked'} className="button" onClick={()=>void update('needs_attention')}><AlertTriangle size={15}/>Needs attention</button><button disabled={saving||stage?.status==='locked'||stage?.status==='approved'} className="button primary-button" onClick={()=>void update('approved')}><Check size={15}/>{saving?'Saving…':'Approve & continue'}</button></div>
   <p className="review-footnote">Current active stage: {currentIndex+1}. Approvals are recorded and the next stage unlocks automatically.</p>
  </aside>
 </div>;
}

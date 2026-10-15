'use client';

import {useEffect,useMemo,useState} from 'react';
import {AlertTriangle,Check,ChevronRight,Clock3,ExternalLink,FileAudio,FileText,Film,LoaderCircle,LockKeyhole,Music2,RefreshCw,Subtitles,UploadCloud} from 'lucide-react';

type StageStatus='locked'|'pending'|'in_progress'|'approved'|'needs_attention';
type Stage={key:string;status:StageStatus;notes:string;approvedAt:string|null};
type Episode={id:string;series:string;episodeNumber:number;title:string;driveFolderId:string;driveFileId:string;sourceFilename:string;durationSeconds:number;sourceMetadata:{video?:string;audio?:string;scriptWords?:number};stages:Stage[];updatedAt:number};

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
 const [selected,setSelected]=useState('transcript');
 const [notes,setNotes]=useState('');
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState('');
 const approved=episode?.stages.filter(stage=>stage.status==='approved').length??0;
 const stage=episode?.stages.find(item=>item.key===selected);
 const definition=definitions.find(item=>item.key===selected)??definitions[0];
 const ReviewIcon=definition.icon;
 const progress=Math.round((approved/definitions.length)*100);
 const currentIndex=Math.max(0,episode?.stages.findIndex(item=>item.status==='in_progress'||item.status==='needs_attention')??0);

 async function load(){setLoading(true);setError('');try{const response=await fetch('/api/production',{cache:'no-store'});const data=await response.json() as {episode?:Episode;error?:string};if(!response.ok||!data.episode)throw Error(data.error||'Could not load production.');setEpisode(data.episode);const active=data.episode.stages.find(item=>item.status==='in_progress'||item.status==='needs_attention')??data.episode.stages[0];setSelected(active.key);setNotes(active.notes)}catch(e){setError(e instanceof Error?e.message:'Could not load production.')}finally{setLoading(false)}}
 async function update(status:StageStatus){if(!episode||!stage||saving)return;setSaving(true);setError('');try{const response=await fetch('/api/production',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:episode.id,stageKey:stage.key,status,notes})});const data=await response.json() as {episode?:Episode;error?:string};if(!response.ok||!data.episode)throw Error(data.error||'Could not update this stage.');setEpisode(data.episode);const next=data.episode.stages.find(item=>item.status==='in_progress'||item.status==='needs_attention');if(status==='approved'&&next){setSelected(next.key);setNotes(next.notes)}}catch(e){setError(e instanceof Error?e.message:'Could not update this stage.')}finally{setSaving(false)}}
 useEffect(()=>{void load()},[]);
 useEffect(()=>{setNotes(stage?.notes??'')},[selected,stage?.notes]);
 const sourceUrl=useMemo(()=>episode?`https://drive.google.com/file/d/${episode.driveFileId}/view`:null,[episode]);

 if(loading)return <section className="production-loading"><LoaderCircle className="spin" size={22}/>Loading production workspace…</section>;
 if(error&&!episode)return <section className="production-loading error-panel"><AlertTriangle size={20}/>{error}<button className="button" onClick={()=>void load()}><RefreshCw size={15}/>Retry</button></section>;
 if(!episode)return null;

 return <div className="production-layout">
  <section className="production-overview">
   <div className="production-episode-card">
    <div className="episode-art"><Film size={26}/><span>S2 · E4</span></div>
    <div className="episode-summary"><p>{episode.series} · Episode {episode.episodeNumber}</p><h2>{episode.title}</h2><span>{episode.durationSeconds.toFixed(1)} sec · {episode.sourceMetadata.video}</span></div>
    <a className="button" href={sourceUrl??'#'} target="_blank" rel="noreferrer">Open render <ExternalLink size={14}/></a>
   </div>
   <div className="production-progress"><div><span>Workflow progress</span><strong>{approved} of {definitions.length} stages approved</strong></div><span>{progress}%</span><div className="progress-track"><i style={{width:`${progress}%`}}/></div></div>
   <div className="workflow-list">{definitions.map((item,index)=>{const state=episode.stages.find(stage=>stage.key===item.key)!;const Icon=item.icon;return <button key={item.key} className={`workflow-stage ${selected===item.key?'selected':''} ${state.status}`} onClick={()=>{setSelected(item.key);setNotes(state.notes)}}><span className="stage-number">{index+1}</span><Icon size={18}/><span><strong>{item.title}</strong><small>{item.description}</small></span><span className="stage-status"><StatusIcon status={state.status}/>{state.status.replaceAll('_',' ')}</span><ChevronRight size={16}/></button>})}</div>
  </section>
  <aside className="production-review">
   <p className="review-kicker">Stage {definitions.findIndex(item=>item.key===selected)+1} of {definitions.length}</p>
   <h2>{definition.title}</h2><p className="review-description">{definition.description}</p>
   {selected==='source'&&<div className="source-facts"><div><span>Source</span><strong>{episode.sourceFilename}</strong></div><div><span>Video</span><strong>{episode.sourceMetadata.video}</strong></div><div><span>Audio</span><strong>{episode.sourceMetadata.audio}</strong></div><div><span>Script</span><strong>{episode.sourceMetadata.scriptWords} words extracted</strong></div></div>}
   {selected==='package'&&<div className="manifest-list">{outputs.map(output=><div key={output}><LockKeyhole size={14}/><span>{output}</span><small>Pending</small></div>)}</div>}
   {selected!=='source'&&selected!=='package'&&<div className="stage-empty"><ReviewIcon size={24}/><strong>{stage?.status==='locked'?'Complete the previous stage first':'Ready for review inputs'}</strong><p>{stage?.status==='locked'?'This stage will unlock automatically after the prior approval.':'Automation for this stage will connect here; notes and approval history are already persistent.'}</p></div>}
   <label className="review-notes">Review notes<textarea rows={5} value={notes} onChange={event=>setNotes(event.target.value)} placeholder="Record corrections, decisions or issues for this stage…"/></label>
   {error&&<p className="connection-error">{error}</p>}
   <div className="review-actions"><button disabled={saving||stage?.status==='locked'} className="button" onClick={()=>void update('needs_attention')}><AlertTriangle size={15}/>Needs attention</button><button disabled={saving||stage?.status==='locked'||stage?.status==='approved'} className="button primary-button" onClick={()=>void update('approved')}><Check size={15}/>{saving?'Saving…':'Approve & continue'}</button></div>
   <p className="review-footnote">Current active stage: {currentIndex+1}. Approvals are recorded and the next stage unlocks automatically.</p>
  </aside>
 </div>;
}

'use client';

import {useEffect, useState} from 'react';
import {flushSync} from 'react-dom';
import {CalendarDays, Plus, ChevronLeft, ChevronRight, ArrowUpRight, Settings2, List, Check, X, Pencil} from 'lucide-react';
import {Tabs, TabsList, TabsTrigger} from '@/components/ui/tabs';
import {Dialog, DialogContent, DialogTitle, DialogDescription} from '@/components/ui/dialog';
import {Select, SelectTrigger, SelectValue, SelectContent, SelectItem} from '@/components/ui/select';
import {Input} from '@/components/ui/input';
import {SocialAnalytics} from '@/components/social-analytics';
import {WebsiteAnalytics} from '@/components/website-analytics';

type Language = 'zu' | 'en';
type Section = 'Scheduling' | 'Analytics';
const platforms = ['Instagram', 'TikTok', 'Facebook', 'YouTube'] as const;
type Platform = typeof platforms[number];
type Target={platform:Platform;status:string;externalId:string|null;error:string|null};
type Post = {id:string;title:string;caption:string;videoUrl:string|null;scheduledAt:string;status:string;language:Language;targets:Target[]};
type Connection = {platform:string; provider:string; status:string; username:string|null};
const colors = {Instagram:'#d991ab', TikTok:'#90c9c2', Facebook:'#91aee4', YouTube:'#de9691'};
const symbols = {Instagram:'ig', TikTok:'tk', Facebook:'f', YouTube:'yt'};
const drive = 'https://drive.google.com/drive/folders/1qWt22B9JZv27JkR9FWlicNH2iVSqFpFV';
const navigationKey='afroreel-studio-navigation';
type NavigationState={language:Language;section:Section;view:string;analytics:string;channel:string;week:number};
const navigationDefaults:NavigationState={language:'zu',section:'Scheduling',view:'list',analytics:'Social',channel:'all',week:0};
function readNavigation():NavigationState{
  if(typeof window==='undefined')return navigationDefaults;
  let stored:Partial<NavigationState>={};
  try{stored=JSON.parse(localStorage.getItem(navigationKey)??'{}') as Partial<NavigationState>}catch{}
  const query=new URLSearchParams(window.location.search);
  const language=query.get('workspace')??stored.language;
  const section=query.get('page')??stored.section;
  const view=query.get('view')??stored.view;
  const analytics=query.get('analytics')??stored.analytics;
  const channel=query.get('channel')??stored.channel;
  const week=Number(query.get('week')??stored.week??0);
  return {
    language:language==='en'?'en':'zu',
    section:section==='Analytics'?'Analytics':'Scheduling',
    view:view==='calendar'?'calendar':'list',
    analytics:analytics==='Website'?'Website':'Social',
    channel:channel==='all'||platforms.includes(channel as Platform)?channel:'all',
    week:Number.isFinite(week)?week:0
  };
}
function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
function datePlus(date:string,n:number){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
function pretty(date:string,options:Intl.DateTimeFormatOptions={day:'numeric',month:'short'}){return new Intl.DateTimeFormat('en-GB',{...options,timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'))}
function Channel({platform}:{platform:Platform}){return <span className="channel"><span className="channel-symbol" style={{color:colors[platform]}} aria-hidden="true">{symbols[platform]}</span>{platform}</span>}
function Picker({value,onChange,options,label}:{value:string;onChange:(v:string)=>void;options:{value:string;label:string}[];label:string}){return <Select value={value} onValueChange={v=>v&&onChange(v)}><SelectTrigger className="picker" aria-label={label}><SelectValue>{options.find(o=>o.value===value)?.label}</SelectValue></SelectTrigger><SelectContent>{options.map(o=><SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select>}

export default function Home(){
  const [language,setLanguage]=useState<Language>(navigationDefaults.language);
  const [section,setSection]=useState<Section>(navigationDefaults.section);
  const [view,setView]=useState(navigationDefaults.view);
  const [analytics,setAnalytics]=useState(navigationDefaults.analytics);
  const [channel,setChannel]=useState(navigationDefaults.channel);
  const [anchor]=useState(today);
  const [week,setWeek]=useState(navigationDefaults.week);
  const [navigationReady,setNavigationReady]=useState(false);
  const [settings,setSettings]=useState(false);
  const [connections,setConnections]=useState<Connection[]>([]);
  const [checking,setChecking]=useState(false);
  const [connectionError,setConnectionError]=useState('');
  const [checkVersion,setCheckVersion]=useState(0);
  const [drafts,setDrafts]=useState<Post[]>([]);
  const [draftOpen,setDraftOpen]=useState(false);
  const [editing,setEditing]=useState<string|null>(null);
  const [title,setTitle]=useState('');
  const [selectedPlatforms,setSelectedPlatforms]=useState<Platform[]>(['Instagram']);
  const [date,setDate]=useState(anchor);
  const [time,setTime]=useState('12:00');
  const [caption,setCaption]=useState('');
  const [videoUrl,setVideoUrl]=useState('');
  const [loadingDrafts,setLoadingDrafts]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [feedback,setFeedback]=useState('');
  const languageName=language==='zu'?'Zulu':'English';
  const days=Array.from({length:7},(_,i)=>datePlus(anchor,week*7+i));
  const posts=drafts.filter(p=>p.language===language&&(channel==='all'||p.targets.some(t=>t.platform===channel))).sort((a,b)=>a.scheduledAt.localeCompare(b.scheduledAt));

  function openDraft(post?:Post,day?:string){const scheduled=post?new Date(post.scheduledAt):null;setEditing(post?.id??null);setTitle(post?.title??'');setSelectedPlatforms(post?.targets.map(t=>t.platform)??[channel==='all'?'Instagram':channel as Platform]);setDate(day??(scheduled?new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit'}).format(scheduled):today()));setTime(scheduled?new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Johannesburg',hour:'2-digit',minute:'2-digit',hour12:false}).format(scheduled):'12:00');setCaption(post?.caption??'');setVideoUrl(post?.videoUrl??'');setError('');setDraftOpen(true)}
  async function savePost(action:'save'|'schedule'|'publish_now',event?:React.SyntheticEvent<HTMLFormElement>){
    event?.preventDefault();if(saving)return;
    if(!title.trim()||!date||!time||!selectedPlatforms.length){setError('Add a title, date, time and at least one platform.');return}
    if(action!=='save'&&!videoUrl.trim()){setError('Add a public video URL before publishing or scheduling.');return}
    if(action==='publish_now'&&!window.confirm(`Publish this post now to ${selectedPlatforms.join(', ')}? This will make it public.`))return;
    setSaving(true);setError('');
    try{
      const response=await fetch('/api/posts',{method:editing?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:editing??undefined,language,title,caption,videoUrl:videoUrl.trim()||null,scheduledAt:`${date}T${time}:00+02:00`,platforms:selectedPlatforms,status:videoUrl.trim()?'ready':'draft'})});
      const result=await response.json() as {error?:string;id?:string;status?:string};
      if(!response.ok)throw new Error(result.error??'Could not save the draft. Try again.');
      const id=editing??result.id;
      if(action!=='save'&&id){const dispatch=await fetch('/api/publish/dispatch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,action})});const outcome=await dispatch.json() as {error?:string;status?:string};if(!dispatch.ok)throw Error(outcome.error??'Publishing could not be prepared.');}
      await loadDrafts();setDraftOpen(false);
      setFeedback(action==='schedule'?'Post queued for automatic publishing.':action==='publish_now'?'Publishing started. Check each platform status.':videoUrl.trim()?'Post saved and ready.':'Draft saved. Add a public video URL when ready.');
    }catch(e){setError(e instanceof Error?e.message:'Could not save. Check your connection and try again.')}finally{setSaving(false)}
  }
  async function retryFailed(){if(!editing||saving)return;setSaving(true);setError('');try{const response=await fetch('/api/publish/dispatch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:editing,action:'retry'})});const data=await response.json() as {error?:string};if(!response.ok)throw Error(data.error||'Retry failed.');await loadDrafts();setDraftOpen(false);setFeedback('Failed platforms were retried.')}catch(e){setError(e instanceof Error?e.message:'Retry failed.')}finally{setSaving(false)}}
  async function loadDrafts(){setLoadingDrafts(true);try{const response=await fetch('/api/posts',{cache:'no-store'});const data=await response.json() as {error?:string;posts?:Post[]};if(!response.ok)throw Error(data.error||'Could not load posts.');setDrafts(data.posts??[])}catch(e){setError(e instanceof Error?e.message:'Could not load posts.')}finally{setLoadingDrafts(false)}}
  async function deleteDraft(id:string){setSaving(true);try{const response=await fetch(`/api/posts?id=${encodeURIComponent(id)}`,{method:'DELETE'});const data=await response.json() as {error?:string};if(!response.ok)throw Error(data.error||'Could not delete the post.');setDrafts(old=>old.filter(p=>p.id!==id));setDraftOpen(false);setFeedback('Post removed.')}catch(e){setError(e instanceof Error?e.message:'Could not delete the post.')}finally{setSaving(false)}}
  useEffect(()=>{const saved=readNavigation();setLanguage(saved.language);setSection(saved.section);setView(saved.view);setAnalytics(saved.analytics);setChannel(saved.channel);setWeek(saved.week);setNavigationReady(true)},[]);
  useEffect(()=>{void loadDrafts()},[]);
  useEffect(()=>{
    if(!navigationReady)return;
    const state={language,section,view,analytics,channel,week};
    try{localStorage.setItem(navigationKey,JSON.stringify(state))}catch{}
    const query=new URLSearchParams();query.set('workspace',language);query.set('page',section);if(section==='Scheduling'){query.set('view',view);if(channel!=='all')query.set('channel',channel);if(week)query.set('week',String(week))}else query.set('analytics',analytics);
    window.history.replaceState(null,'',`${window.location.pathname}?${query.toString()}`);
  },[navigationReady,language,section,view,analytics,channel,week]);
  useEffect(()=>{
    if(!settings)return;
    const controller=new AbortController();setChecking(true);setConnections([]);setConnectionError('');
    fetch(`/api/connections?language=${language}`,{signal:controller.signal,cache:'no-store'}).then(async response=>{const data=await response.json() as {error?:string;accounts?:Connection[]};if(!response.ok)throw new Error(data.error||'Unable to check connections.');if(!controller.signal.aborted)setConnections(data.accounts??[])}).catch(e=>{if(!controller.signal.aborted)setConnectionError(e instanceof Error?e.message:'Unable to check connections.')}).finally(()=>{if(!controller.signal.aborted)setChecking(false)});
    return()=>controller.abort();
  },[settings,language,checkVersion]);
  useEffect(()=>{if(!feedback)return;const timer=setTimeout(()=>setFeedback(''),5000);return()=>clearTimeout(timer)},[feedback]);
  useEffect(()=>{
    const context=(document as Document & {modelContext?:{registerTool:(tool:unknown,options:unknown)=>void|Promise<void>}}).modelContext;if(!context?.registerTool)return;
    const lifecycle=new AbortController();
    try{
      Promise.resolve(context.registerTool({name:'navigate_studio',description:'Open Scheduling or Analytics in AfroReel Studio.',inputSchema:{type:'object',properties:{section:{type:'string',enum:['Scheduling','Analytics','Analysis']}},required:['section'],additionalProperties:false},execute(input:unknown){const value=(input as {section?:unknown})?.section;if(value!=='Scheduling'&&value!=='Analytics'&&value!=='Analysis')throw new Error('Choose Scheduling or Analytics.');flushSync(()=>setSection(value==='Analysis'?'Analytics':value));return {section:value,publishingEnabled:false}}},{signal:lifecycle.signal})).catch(()=>{});
      Promise.resolve(context.registerTool({name:'diagnose_meta',description:'Run a read-only Meta connection diagnostic for an AfroReel workspace.',inputSchema:{type:'object',properties:{language:{type:'string',enum:['zu','en']}},required:['language'],additionalProperties:false},async execute(input:unknown){const value=(input as {language?:unknown})?.language;if(value!=='zu'&&value!=='en')throw new Error('Choose zu or en.');const response=await fetch(`/api/meta/diagnostics?language=${value}`,{cache:'no-store'});const result=await response.json();if(!response.ok)throw new Error((result as {error?:string}).error??'Meta diagnostics failed.');return result;}},{signal:lifecycle.signal})).catch(()=>{});
    }catch{}
    return()=>lifecycle.abort();
  },[]);

  return <div className="studio dark">
    <header className="studio-header">
      <a href="/" className="studio-brand" aria-label="AfroReel Studio"><img src="/afroreel-logo.jpg" alt=""/><span>afroreel <small>Studio</small></span></a>
      <Tabs value={section} onValueChange={v=>setSection(v as Section)} className="studio-nav"><TabsList variant="line" aria-label="Main navigation"><TabsTrigger value="Scheduling">Scheduling</TabsTrigger><TabsTrigger value="Analytics">Analytics</TabsTrigger></TabsList></Tabs>
      <div className="studio-controls"><Picker label="Language workspace" value={language} onChange={v=>{setLanguage(v as Language);setDraftOpen(false);setFeedback('')}} options={[{value:'zu',label:'Zulu'},{value:'en',label:'English'}]}/><button className="settings-trigger" onClick={()=>setSettings(true)} aria-label="Settings"><Settings2 size={19}/></button></div>
    </header>
    <main className="studio-main">
      <div className="studio-heading"><div><p className="eyebrow">{languageName} workspace</p><h1>{section}</h1><p className="intro">{section==='Scheduling'?'Your content, organised in one place.':'See how your content and website perform.'}</p></div>{section==='Scheduling'&&<button className="button primary-button" onClick={()=>openDraft()}><Plus size={17}/>New post</button>}</div>
      {section==='Scheduling'?<>
        <div className="studio-toolbar"><Picker label="Filter posts by channel" value={channel} onChange={setChannel} options={[{value:'all',label:'All channels'},...platforms.map(p=>({value:p,label:p}))]}/><Tabs value={view} onValueChange={v=>setView(v as string)}><TabsList className="view-toggle" aria-label="Post display"><TabsTrigger value="list"><List size={15}/>List</TabsTrigger><TabsTrigger value="calendar"><CalendarDays size={15}/>Calendar</TabsTrigger></TabsList></Tabs></div>
        {view==='list'?<section className="post-list" aria-label="Planned posts">{loadingDrafts?<p className="analytics-notice">Loading scheduled posts…</p>:posts.length===0?<div className="studio-empty"><div className="empty-symbol"><CalendarDays size={28} strokeWidth={1.4}/></div><h2>{channel==='all'?'A clear space for your next post':`No ${channel} posts yet`}</h2><p>Choose one or more channels, add a caption and plan a time.</p><span className="empty-hint">Start with New post above</span></div>:<><div className="list-labels"><span>Post</span><span>Channels</span><span>Planned for · UTC+2</span><span>Status</span></div>{posts.map(p=>{const d=new Date(p.scheduledAt);return <button key={p.id} className="post-list-row" onClick={()=>openDraft(p)} aria-label={`Edit ${p.title}`}><strong>{p.title}</strong><span className="channel-stack">{p.targets.map(t=><span key={t.platform} title={`${t.platform}: ${t.status}`}><Channel platform={t.platform}/></span>)}</span><span>{d.toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'Africa/Johannesburg'})} <span className="muted">· {d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Africa/Johannesburg'})}</span></span><span className="draft-tag">{p.status.replaceAll('_',' ')} <Pencil size={13}/></span></button>})}</>}</section>:<section className="calendar-panel" aria-label="Weekly post calendar"><div className="calendar-navigation"><div><button className="small-icon" aria-label="Previous week" onClick={()=>setWeek(w=>w-1)}><ChevronLeft size={17}/></button><h2>{pretty(days[0])} – {pretty(days[6],{day:'numeric',month:'short',year:'numeric'})}</h2><button className="small-icon" aria-label="Next week" onClick={()=>setWeek(w=>w+1)}><ChevronRight size={17}/></button></div><button className="text-button" onClick={()=>setWeek(0)}>Today</button></div><div className="calendar-scroll"><div className="simple-calendar">{days.map(day=><div className="calendar-day" key={day}><div className={'calendar-date '+(day===anchor?'is-today':'')}><span>{pretty(day,{weekday:'short'})}</span><strong>{Number(day.slice(-2))}</strong><button className="small-icon" aria-label={`Plan a post for ${pretty(day)}`} onClick={()=>openDraft(undefined,day)}><Plus size={15}/></button></div>{posts.filter(p=>new Date(p.scheduledAt).toLocaleDateString('en-CA',{timeZone:'Africa/Johannesburg'})===day).map(p=><button className="calendar-post" key={p.id} onClick={()=>openDraft(p)} aria-label={`Edit ${p.title}`}><span className="channel-stack">{p.targets.map(t=><Channel key={t.platform} platform={t.platform}/>)}</span><strong>{p.title}</strong><span>{new Date(p.scheduledAt).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Africa/Johannesburg'})} · {p.status.replaceAll('_',' ')}</span></button>)}</div>)}</div></div></section>}
        <p className="workspace-note">Posts are saved securely and scheduled posts publish automatically at the selected Johannesburg time.</p>
      </>:<>
        <div className="studio-toolbar"><Tabs value={analytics} onValueChange={v=>setAnalytics(v as string)}><TabsList className="view-toggle" aria-label="Analytics source"><TabsTrigger value="Social">Social media</TabsTrigger><TabsTrigger value="Website">Website</TabsTrigger></TabsList></Tabs></div>
        {analytics==='Social'?<SocialAnalytics key={language} language={language}/>:<WebsiteAnalytics/>}
      </>}
    </main>
    <Dialog open={draftOpen} onOpenChange={v=>{if(!saving)setDraftOpen(v)}}><DialogContent className="draft-dialog"><DialogTitle>{editing?'Edit post':'Plan a post'}</DialogTitle><DialogDescription>{languageName} workspace · Save a draft, schedule it, or publish immediately.</DialogDescription><form className="draft-form" onSubmit={e=>void savePost('save',e)}><label>Title<Input required maxLength={180} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Series name · Episode 1"/></label><fieldset className="platform-field"><legend>Post to</legend><div className="platform-options">{platforms.map(p=><button type="button" key={p} className={selectedPlatforms.includes(p)?'platform-option selected':'platform-option'} aria-pressed={selectedPlatforms.includes(p)} onClick={()=>setSelectedPlatforms(old=>old.includes(p)?old.filter(x=>x!==p):[...old,p])}><Channel platform={p}/>{selectedPlatforms.includes(p)&&<Check size={15}/>}</button>)}</div></fieldset><label>Video URL<Input type="url" value={videoUrl} onChange={e=>setVideoUrl(e.target.value)} placeholder="https://…/video.mp4"/></label><p className="form-note">Use a public HTTPS video URL.</p><label>Caption<textarea rows={4} value={caption} onChange={e=>setCaption(e.target.value)} placeholder="Write your caption…"/></label><div className="form-row"><label>Planned date<Input required type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label>Time · Johannesburg<Input required type="time" value={time} onChange={e=>setTime(e.target.value)}/></label></div>{editing&&drafts.find(p=>p.id===editing)?.targets.map(t=><p className="target-state" key={t.platform}><strong>{t.platform}</strong> · {t.status}{t.error?` · ${t.error}`:''}</p>)}{error&&<p role="alert" className="connection-error">{error}</p>}<div className="form-actions">{editing&&!drafts.find(p=>p.id===editing)?.targets.some(t=>t.status==='published'||t.status==='publishing')&&<button disabled={saving} className="delete-button" type="button" onClick={()=>void deleteDraft(editing)}>Delete</button>}{editing&&drafts.find(p=>p.id===editing)?.targets.some(t=>t.status==='failed')&&<button disabled={saving} type="button" className="button" onClick={()=>void retryFailed()}>Retry failed</button>}<button disabled={saving} type="submit" className="button">Save changes</button><button disabled={saving||!videoUrl.trim()} type="button" className="button" onClick={()=>void savePost('schedule')}>Schedule</button><button disabled={saving||!videoUrl.trim()} type="button" className="button primary-button" onClick={()=>void savePost('publish_now')}>{saving?'Working…':'Publish now'}</button></div></form></DialogContent></Dialog>
    <Dialog open={settings} onOpenChange={setSettings}><DialogContent className="connections-dialog"><DialogTitle>Settings</DialogTitle><DialogDescription>Accounts and integrations for the {languageName} workspace.</DialogDescription><div className="settings-section-heading"><h3>Social accounts</h3><button className="text-button" disabled={checking} onClick={()=>setCheckVersion(v=>v+1)}>{checking?'Checking…':'Refresh status'}</button></div>{connectionError&&<p role="alert" className="connection-error">{connectionError}</p>}{platforms.map(p=>{const account=connections.find(a=>a.platform===p);const connected=account?.status==='connected';return <div className="connection-row" key={p}><div><Channel platform={p}/><p>{account?.username?'@'+account.username.replace(/^@/,''):(p==='Facebook'||p==='Instagram'?'Meta':'Zernio')}</p></div><span className={'status '+(connected?'connected-status':'')}>{checking?'Checking':connectionError?'Check failed':connected?'Connected':account?.status==='needs_attention'?'Needs attention':'Not verified'}</span></div>})}<p className="form-note">Account connection does not confirm that publishing or analytics is ready.</p><div className="settings-section-heading"><h3>Library & website</h3></div><div className="connection-row"><div><strong>Video library</strong><p>Drive folder · import pending</p></div><a className="text-button" href={drive} target="_blank" rel="noreferrer">Open folder <ArrowUpRight size={14}/></a></div><div className="connection-row"><div><strong>Website analytics</strong><p>Connected to Lovable</p></div><a className="text-button" href="https://afroreel.app/" target="_blank" rel="noreferrer">Open site <ArrowUpRight size={14}/></a></div></DialogContent></Dialog>
    {feedback&&<div className="feedback" role="status"><Check size={16}/>{feedback}<button aria-label="Dismiss notification" onClick={()=>setFeedback('')}><X size={15}/></button></div>}
  </div>;
}

'use client';

import {useEffect, useState} from 'react';
import {flushSync} from 'react-dom';
import {CalendarDays, ChartNoAxesCombined, Plus, ChevronLeft, ChevronRight, ArrowUpRight, Settings2, List, Check, X} from 'lucide-react';
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
type Post = {id:string; title:string; platform:Platform; date:string; time:string; caption:string; language:Language};
type Connection = {platform:string; provider:string; status:string; username:string|null};
const colors = {Instagram:'#d991ab', TikTok:'#90c9c2', Facebook:'#91aee4', YouTube:'#de9691'};
const symbols = {Instagram:'ig', TikTok:'tk', Facebook:'f', YouTube:'yt'};
const drive = 'https://drive.google.com/drive/folders/1qWt22B9JZv27JkR9FWlicNH2iVSqFpFV';
function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
function datePlus(date:string,n:number){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
function pretty(date:string,options:Intl.DateTimeFormatOptions={day:'numeric',month:'short'}){return new Intl.DateTimeFormat('en-GB',{...options,timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'))}
function Channel({platform}:{platform:Platform}){return <span className="channel"><span className="channel-symbol" style={{color:colors[platform]}} aria-hidden="true">{symbols[platform]}</span>{platform}</span>}
function Picker({value,onChange,options,label}:{value:string;onChange:(v:string)=>void;options:{value:string;label:string}[];label:string}){return <Select value={value} onValueChange={v=>v&&onChange(v)}><SelectTrigger className="picker" aria-label={label}><SelectValue>{options.find(o=>o.value===value)?.label}</SelectValue></SelectTrigger><SelectContent>{options.map(o=><SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select>}

export default function Home(){
  const [language,setLanguage]=useState<Language>('zu');
  const [section,setSection]=useState<Section>('Scheduling');
  const [view,setView]=useState('list');
  const [analytics,setAnalytics]=useState('Social');
  const [channel,setChannel]=useState('all');
  const [anchor]=useState(today);
  const [week,setWeek]=useState(0);
  const [settings,setSettings]=useState(false);
  const [connections,setConnections]=useState<Connection[]>([]);
  const [checking,setChecking]=useState(false);
  const [connectionError,setConnectionError]=useState('');
  const [checkVersion,setCheckVersion]=useState(0);
  const [drafts,setDrafts]=useState<Post[]>([]);
  const [draftOpen,setDraftOpen]=useState(false);
  const [editing,setEditing]=useState<string|null>(null);
  const [title,setTitle]=useState('');
  const [platform,setPlatform]=useState<Platform>('Instagram');
  const [date,setDate]=useState(anchor);
  const [time,setTime]=useState('12:00');
  const [caption,setCaption]=useState('');
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [feedback,setFeedback]=useState('');
  const languageName=language==='zu'?'Zulu':'English';
  const days=Array.from({length:7},(_,i)=>datePlus(anchor,week*7+i));
  const posts=drafts.filter(p=>p.language===language&&(channel==='all'||p.platform===channel)).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));

  function openDraft(post?:Post,day?:string){setEditing(post?.id??null);setTitle(post?.title??'');setPlatform(post?.platform??(channel==='all'?'Instagram':channel as Platform));setDate(day??post?.date??today());setTime(post?.time??'12:00');setCaption(post?.caption??'');setError('');setDraftOpen(true)}
  async function saveDraft(event:React.FormEvent){
    event.preventDefault();if(saving)return;
    if(!title.trim()||!date||!time){setError('Add a title, date and time.');return}
    setSaving(true);setError('');
    try{
      const response=await fetch('/api/publish/plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({language,title,caption,scheduledAt:`${date}T${time}:00+02:00`,platforms:[platform]})});
      const result=await response.json() as {error?:string};
      if(!response.ok)throw new Error(result.error??'Could not save the draft. Try again.');
      const post:Post={id:editing??crypto.randomUUID(),title:title.trim(),platform,date,time,caption,language};
      setDrafts(old=>editing?old.map(p=>p.id===editing?post:p):[...old,post]);setDraftOpen(false);setChannel('all');setView('list');setFeedback('Draft saved for this visit. Nothing was published.');
    }catch(e){setError(e instanceof Error?e.message:'Could not save. Check your connection and try again.')}finally{setSaving(false)}
  }
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
    try{Promise.resolve(context.registerTool({name:'navigate_studio',description:'Open Scheduling or Analytics in AfroReel Studio.',inputSchema:{type:'object',properties:{section:{type:'string',enum:['Scheduling','Analytics','Analysis']}},required:['section'],additionalProperties:false},execute(input:unknown){const value=(input as {section?:unknown})?.section;if(value!=='Scheduling'&&value!=='Analytics'&&value!=='Analysis')throw new Error('Choose Scheduling or Analytics.');flushSync(()=>setSection(value==='Analysis'?'Analytics':value));return {section:value,publishingEnabled:false}}},{signal:lifecycle.signal})).catch(()=>{})}catch{}
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
        {view==='list'?<section className="post-list" aria-label="Planned posts">{posts.length===0?<div className="studio-empty"><div className="empty-symbol"><CalendarDays size={28} strokeWidth={1.4}/></div><h2>{channel==='all'?'A clear space for your next post':`No ${channel} drafts yet`}</h2><p>Choose a channel, add your caption and plan a time.<br/>Your drafts will appear here.</p><span className="empty-hint">Start with New post above</span></div>:<><div className="list-labels"><span>Post</span><span>Channel</span><span>Planned for · UTC+2</span><span>Status</span></div>{posts.map(p=><button key={p.id} className="post-list-row" onClick={()=>openDraft(p)}><strong>{p.title}</strong><Channel platform={p.platform}/><span>{pretty(p.date)} <span className="muted">· {p.time}</span></span><span className="draft-tag">Draft <ChevronRight size={14}/></span></button>)}</>}</section>:<section className="calendar-panel" aria-label="Weekly draft calendar"><div className="calendar-navigation"><div><button className="small-icon" aria-label="Previous week" onClick={()=>setWeek(w=>w-1)}><ChevronLeft size={17}/></button><h2>{pretty(days[0])} – {pretty(days[6],{day:'numeric',month:'short',year:'numeric'})}</h2><button className="small-icon" aria-label="Next week" onClick={()=>setWeek(w=>w+1)}><ChevronRight size={17}/></button></div><button className="text-button" onClick={()=>setWeek(0)}>Today</button></div><div className="calendar-scroll"><div className="simple-calendar">{days.map(day=><div className="calendar-day" key={day}><div className={'calendar-date '+(day===anchor?'is-today':'')}><span>{pretty(day,{weekday:'short'})}</span><strong>{Number(day.slice(-2))}</strong><button className="small-icon" aria-label={`Plan a post for ${pretty(day)}`} onClick={()=>openDraft(undefined,day)}><Plus size={15}/></button></div>{posts.filter(p=>p.date===day).map(p=><button className="calendar-post" key={p.id} onClick={()=>openDraft(p)}><Channel platform={p.platform}/><strong>{p.title}</strong><span>{p.time} · Draft</span></button>)}</div>)}</div></div></section>}
        <p className="workspace-note">Drafts are saved for this visit only. Publishing and automatic scheduling are not enabled in this dashboard yet.</p>
      </>:<>
        <div className="studio-toolbar"><Tabs value={analytics} onValueChange={v=>setAnalytics(v as string)}><TabsList className="view-toggle" aria-label="Analytics source"><TabsTrigger value="Social">Social media</TabsTrigger><TabsTrigger value="Website">Website</TabsTrigger></TabsList></Tabs></div>
        {analytics==='Social'?<SocialAnalytics key={language} language={language}/>:<WebsiteAnalytics/>}
      </>}
    </main>
    <Dialog open={draftOpen} onOpenChange={v=>{if(!saving)setDraftOpen(v)}}><DialogContent className="draft-dialog"><DialogTitle>{editing?'Edit draft':'Plan a post'}</DialogTitle><DialogDescription>{languageName} workspace · This creates a draft, not a scheduled post.</DialogDescription><form className="draft-form" onSubmit={saveDraft}><label>Title<Input required maxLength={180} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Series name · Episode 1"/></label><label>Post to<Picker label="Post channel" value={platform} onChange={v=>setPlatform(v as Platform)} options={platforms.map(p=>({value:p,label:p}))}/></label><label>Caption<textarea rows={3} value={caption} onChange={e=>setCaption(e.target.value)} placeholder="Write your caption…"/></label><div className="form-row"><label>Planned date<Input required type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label>Time · Johannesburg<Input required type="time" value={time} onChange={e=>setTime(e.target.value)}/></label></div><p className="form-note">Drafts last for this visit. Video attachment and publishing are still being set up.</p>{error&&<p role="alert" className="connection-error">{error}</p>}<div className="form-actions">{editing&&<button disabled={saving} className="delete-button" type="button" onClick={()=>{setDrafts(old=>old.filter(p=>p.id!==editing));setDraftOpen(false);setFeedback('Draft removed.')}}>Delete draft</button>}<button disabled={saving} type="button" className="button" onClick={()=>setDraftOpen(false)}>Cancel</button><button disabled={saving} type="submit" className="button primary-button">{saving?'Saving…':'Save draft'}</button></div></form></DialogContent></Dialog>
    <Dialog open={settings} onOpenChange={setSettings}><DialogContent className="connections-dialog"><DialogTitle>Settings</DialogTitle><DialogDescription>Accounts and integrations for the {languageName} workspace.</DialogDescription><div className="settings-section-heading"><h3>Social accounts</h3><button className="text-button" disabled={checking} onClick={()=>setCheckVersion(v=>v+1)}>{checking?'Checking…':'Refresh status'}</button></div>{connectionError&&<p role="alert" className="connection-error">{connectionError}</p>}{platforms.map(p=>{const account=connections.find(a=>a.platform===p);const connected=account?.status==='connected';return <div className="connection-row" key={p}><div><Channel platform={p}/><p>{account?.username?'@'+account.username.replace(/^@/,''):(p==='Facebook'||p==='Instagram'?'Meta':'Zernio')}</p></div><span className={'status '+(connected?'connected-status':'')}>{checking?'Checking':connectionError?'Check failed':connected?'Connected':account?.status==='needs_attention'?'Needs attention':'Not verified'}</span></div>})}<p className="form-note">Account connection does not confirm that publishing or analytics is ready.</p><div className="settings-section-heading"><h3>Library & website</h3></div><div className="connection-row"><div><strong>Video library</strong><p>Drive folder · import pending</p></div><a className="text-button" href={drive} target="_blank" rel="noreferrer">Open folder <ArrowUpRight size={14}/></a></div><div className="connection-row"><div><strong>Website analytics</strong><p>Connected to Lovable</p></div><a className="text-button" href="https://afroreel.app/" target="_blank" rel="noreferrer">Open site <ArrowUpRight size={14}/></a></div></DialogContent></Dialog>
    {feedback&&<div className="feedback" role="status"><Check size={16}/>{feedback}<button aria-label="Dismiss notification" onClick={()=>setFeedback('')}><X size={15}/></button></div>}
  </div>;
}

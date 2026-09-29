'use client';
import {useEffect,useState} from 'react';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
type Episode={episodeId:string;episodeNumber:number;title:string;seriesId:string;views:number};
type Data={period:{from:string;to:string};visitors:number;episodeViews:number;signups:number;topEpisodes:Episode[]};
export function WebsiteAnalytics(){
 const [days,setDays]=useState('30'),[version,setVersion]=useState(0),[data,setData]=useState<Data|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{const c=new AbortController();setLoading(true);setError('');fetch(`/api/website-analytics?days=${days}`,{signal:c.signal,cache:'no-store'}).then(async r=>{const d=await r.json() as Data&{error?:string};if(!r.ok)throw Error(d.error||'Unable to load website analytics.');return d}).then(d=>{if(!c.signal.aborted)setData(d)}).catch(e=>{if(!c.signal.aborted)setError(e.message||'Unable to load website analytics.')}).finally(()=>{if(!c.signal.aborted)setLoading(false)});return()=>c.abort()},[days,version]);
 return <section aria-label="Website performance" className="social-performance">
  <div className="analytics-controls"><Select value={days} onValueChange={v=>v&&setDays(v)}><SelectTrigger aria-label="Website analytics date range"><SelectValue>Last {days} days</SelectValue></SelectTrigger><SelectContent>{['7','30','90'].map(d=><SelectItem key={d} value={d}>Last {d} days</SelectItem>)}</SelectContent></Select><button className="button" disabled={loading} onClick={()=>setVersion(v=>v+1)}>{loading?'Loading…':'Refresh'}</button></div>
  {loading?<p role="status" className="analytics-notice">Fetching website performance…</p>:error?<p role="alert" className="connection-error">{error}</p>:data&&<>
   <div className="metric-grid"><div className="metric-card"><span>Visitors</span><strong>{data.visitors.toLocaleString()}</strong><small>Unique people</small></div><div className="metric-card"><span>Episode views</span><strong>{data.episodeViews.toLocaleString()}</strong><small>Total views</small></div><div className="metric-card"><span>Signups</span><strong>{data.signups.toLocaleString()}</strong><small>Completed signups</small></div></div>
   <div className="analytics-results"><h2>Top episodes</h2><p className="workspace-note">{new Date(data.period.from).toLocaleDateString()} to {new Date(data.period.to).toLocaleDateString()} · Sorted by views</p>{data.topEpisodes.length?<div className="analytics-table-scroll"><table className="analytics-table"><thead><tr><th>Episode</th><th>Number</th><th>Views</th></tr></thead><tbody>{data.topEpisodes.map(e=><tr key={e.episodeId}><td>{e.title}</td><td>{e.episodeNumber}</td><td>{e.views.toLocaleString()}</td></tr>)}</tbody></table></div>:<p className="analytics-notice">No episode views in this period.</p>}</div>
  </>}
 </section>;
}

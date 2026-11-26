import { ArrowUpRight, BookOpen, Check, ChevronRight, Crosshair, FileText, Link2, Magnet, MessageSquare, Plus, RefreshCw, Search, Sparkles, X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Annotation, Source, TaskDraft } from '../shared/model';
import type { Match } from '../shared/intelligence';
import { IconButton } from './IconButton';
export type InspectorTab='Annotations'|'Context'|'Tasks';
interface Props {
  tab:InspectorTab; setTab:(tab:InspectorTab)=>void; close:()=>void; annotations:Annotation[]; selected:string[];
  onAnnotation:(item:Annotation)=>void; resolve:(item:Annotation)=>void; addAnnotation:()=>void; findContext:()=>void; draft:()=>void;
  query:string; setQuery:(query:string)=>void; search:()=>void; sources:Match[]; linked:Source[]; addSource:(source:Source,link:boolean)=>void;
  refresh:(source:Source)=>void; remove:(source:Source)=>void; dismiss:(id:string)=>void; drafts:TaskDraft[]; editDraft:(index:number)=>void;
  exportDrafts:()=>void; busy:boolean; warnings:string[]; selectionSummary?:ReactNode;
}
export function Inspector(props:Props) {
  const {tab,setTab,close,annotations,selected,onAnnotation,resolve,addAnnotation,findContext,draft,query,setQuery,search,
    sources,linked,addSource,refresh,remove,dismiss,drafts,editDraft,exportDrafts,busy,warnings}=props;
  return <aside className="inspector" aria-label="Inspector">
    <header className="inspector-title"><div className="inspector-mark"><Crosshair size={18}/></div><div><h2>Inspector</h2><p>{selected.length?selected.length+' selected':'Canvas details'}</p></div><IconButton label="Close inspector" onClick={close}><X size={18}/></IconButton></header>
    <div className="inspector-tabs" role="tablist" aria-label="Inspector views">
      {([['Annotations',MessageSquare],['Context',Magnet],['Tasks',FileText]] as const).map(([name,Icon])=><button key={name} id={'inspector-tab-'+name} role="tab" aria-controls="inspector-panel" aria-selected={tab===name} onClick={()=>setTab(name)}><Icon size={14}/>{name}</button>)}
    </div>
    <div className="inspector-body" id="inspector-panel" role="tabpanel" aria-labelledby={'inspector-tab-'+tab}>
      {tab==='Annotations'&&<>
        <div className="inspector-heading"><h3>Annotations <span>{annotations.length}</span></h3><IconButton label="Add annotation" onClick={addAnnotation}><Plus size={18}/></IconButton></div>
        {annotations.map((item)=><article key={item.id} className={'annotation-card '+(selected.includes(item.elementId)?'active':'')}>
          <button className="annotation-main" onClick={()=>onAnnotation(item)}><span className="annotation-number">{item.number}</span><span><strong>{item.resolved?'Resolved':'Open'}<i/></strong><span>{item.note}</span>{item.linkedIssue&&<small>{item.linkedIssue}</small>}</span><ChevronRight size={15}/></button>
          {selected.includes(item.elementId)&&<div className="annotation-actions"><button className="button compact" onClick={findContext}><Magnet size={13}/> Find context</button><IconButton label={item.resolved?'Reopen annotation':'Resolve annotation'} onClick={()=>resolve(item)}><Check size={16}/></IconButton></div>}
        </article>)}
        {!annotations.length&&<div className="inspector-empty"><MessageSquare size={25}/><p>Pin feedback to a screenshot or drawing.</p><button className="button" onClick={addAnnotation}><Plus size={15}/> Add annotation</button></div>}
      </>}
      {tab==='Context'&&<>
        <form className="context-search" onSubmit={(event)=>{event.preventDefault();search();}}><label className="search-input"><Search size={15}/><input aria-label="Search Jira and Confluence" placeholder="Search Jira and Confluence" value={query} onChange={(event)=>setQuery(event.target.value)}/></label><button className="button compact" disabled={busy||!query.trim()}>Search</button></form>
        <div className="inspector-heading"><h3>Related work</h3>{busy&&<span role="status">Searching…</span>}</div>
        {warnings.map((warning)=><p className="warning" key={warning}>{warning}</p>)}
        {!sources.length&&!busy&&<p className="empty">Search for a source or select canvas content and use Find context.</p>}
        {sources.map(({source,why,duplicate})=><article className="source-card" key={source.id}>
          <header><span className="source-product">{source.product==='Jira'?<Link2 size={13}/>:<BookOpen size={13}/>} {source.product==='Jira'?source.id:source.product}</span><IconButton label={'Dismiss '+source.title} onClick={()=>dismiss(source.id)}><X size={14}/></IconButton></header>
          <strong>{source.title}</strong><p>{source.description}</p><p className="evidence">{why}</p>
          <div className="source-status"><span>{source.status}</span>{duplicate&&<span className="duplicate">Possible duplicate</span>}</div>
          <footer><button className="button compact" onClick={()=>addSource(source,false)}><Plus size={13}/> Add</button><button className="button compact" disabled={!selected.length} onClick={()=>addSource(source,true)}><Link2 size={13}/> Link</button>
            {source.url&&<a title="Open source" className="icon-button" href={source.url} target="_blank" rel="noreferrer"><ArrowUpRight size={15}/></a>}</footer>
        </article>)}
        {linked.length>0&&<><div className="inspector-heading"><h3>On this canvas</h3></div>{linked.map((source)=><article className="source-card" key={source.id}>
          <span className="source-product">{source.product} · {source.status}</span><strong>{source.title}</strong>
          <p>Manually linked · {new Date(source.retrievedAt).toLocaleDateString()}</p>
          <footer><IconButton label={'Refresh '+source.title} onClick={()=>refresh(source)}><RefreshCw size={15}/></IconButton>
            {source.url&&<a title="Open source" className="icon-button" href={source.url} target="_blank" rel="noreferrer"><ArrowUpRight size={15}/></a>}
            <button className="button compact" onClick={()=>remove(source)}>Remove</button></footer>
        </article>)}</>}
      </>}
      {tab==='Tasks'&&<>
        <div className="inspector-heading"><h3>Issue drafts</h3>{drafts.length>0&&<button className="button compact" onClick={exportDrafts}>Markdown</button>}</div>
        {!drafts.length&&<div className="inspector-empty"><Sparkles size={25}/><p>Turn annotations or a selected flow into editable Jira drafts.</p><button className="button" onClick={draft} disabled={busy}><Sparkles size={15}/> Generate drafts</button></div>}
        {drafts.map((task,index)=><button className="task-card" key={index} onClick={()=>editDraft(index)}><span className="source-product">{task.issueType} · Draft</span><strong>{task.title}</strong><small>{task.evidence.length} sources · Review draft</small></button>)}
      </>}
    </div>
    <footer className="inspector-footer"><button className="button" disabled={busy} onClick={findContext}><Magnet size={16}/> Find context</button><button className="button primary" disabled={busy} onClick={draft}><Sparkles size={16}/> Draft tasks</button></footer>
  </aside>;
}

import { useEffect, useState } from 'react';
import { Command, Search } from 'lucide-react';
import { Modal } from './Modal';
export type CommandItem={label:string;detail?:string;run:()=>void};
export function CommandPalette({items,onClose}:{items:CommandItem[];onClose:()=>void}) {
  const [query,setQuery]=useState('');
  const [index,setIndex]=useState(0);
  const shown=items.filter((item)=>(item.label+' '+(item.detail??'')).toLowerCase().includes(query.toLowerCase())).slice(0,15);
  useEffect(()=>{document.getElementById('command-option-'+index)?.scrollIntoView({block:'nearest'});},[index]);
  const choose=(item:CommandItem)=>{onClose();item.run();};
  return <Modal title="Commands" onClose={onClose}>
    <div className="command-search"><Search size={18}/><input autoFocus aria-label="Search commands" value={query} placeholder="Type a command or find a board…" onChange={(event)=>{setQuery(event.target.value);setIndex(0);}}
      onKeyDown={(event)=>{
        if(event.key==='ArrowDown'||event.key==='ArrowUp'){
          event.preventDefault();setIndex((value)=>Math.max(0,Math.min(shown.length-1,value+(event.key==='ArrowDown'?1:-1))));
        }else if(event.key==='Enter'&&shown[index]){event.preventDefault();choose(shown[index]);}
      }}/></div>
    <div className="command-list">{shown.map((item,i)=><button id={'command-option-'+i} key={item.label+i} className={i===index?'active':''} onMouseEnter={()=>setIndex(i)} onClick={()=>choose(item)}>
      <Command size={15}/><span>{item.label}{item.detail&&<small>{item.detail}</small>}</span>
    </button>)}{!shown.length&&<p className="empty">No matching commands.</p>}</div>
  </Modal>;
}

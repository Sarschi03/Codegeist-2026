import { Moon, Sun } from 'lucide-react';
import { limits } from '../shared/model';
import type { Mode } from '../data/services';
import { Modal } from './Modal';
export type Theme='light'|'dark';
export function Settings({mode,theme,toggle,onClose,usage}:{mode:Mode;theme:Theme;toggle:()=>void;onClose:()=>void;usage?:number}) {
  return <Modal title="Settings" onClose={onClose}>
    <div className="settings-row"><div><strong>Appearance</strong><p>{theme==='dark'?'Dark theme':'Light theme'}</p></div><button className="button" onClick={toggle}>{theme==='dark'?<Sun size={16}/>:<Moon size={16}/>} Switch theme</button></div>
    <div className="settings-row"><div><strong>Workspace storage</strong><p>{mode==='Atlassian'?'Forge hosted storage':mode==='Convex'?'Convex development deployment':'IndexedDB on this device'}</p>{usage!==undefined&&<p>Current canvas estimate {(usage/1024).toFixed(1)} KB</p>}</div></div>
    <div className="settings-row"><div><strong>Sources and analysis</strong><p>{mode==='Atlassian'?'Jira and Confluence, subject to site access':'Fictional Jira and Confluence records'}</p><p>Local OCR · deterministic search and drafts</p></div></div>
    <div className="settings-row"><div><strong>Application limits</strong><p>{limits.workspaces} boards · {limits.images} images per board · {limits.searchResults} results per source</p></div></div>
  </Modal>;
}

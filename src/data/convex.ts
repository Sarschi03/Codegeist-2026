import type { Workspace, WorkspaceSummary } from '../shared/model';
import type { WorkspaceRepository } from './repository';
async function request<T>(op:string,args:object={}) {
  const response=await fetch('./__trace_convex',{method:'POST',headers:{'Content-Type':'application/json','X-Trace-Client':'1'},body:JSON.stringify({op,...args})});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error??'Convex is unavailable.');
  return data.result as T;
}
export const convexRepository:WorkspaceRepository={
  list:()=>request<WorkspaceSummary[]>('list'),
  async get(id){return (await request<Workspace|null>('get',{id}))??undefined;},
  async save(workspace,expected){const saved=await request<WorkspaceSummary>('save',{workspace,expected});return {...workspace,...saved};},
  async remove(id,expected){await request('remove',{id,expected});},
};

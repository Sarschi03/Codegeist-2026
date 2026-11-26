import { invoke as bridgeInvoke, type InvokePayload } from '@forge/bridge';
import type { Workspace } from '../shared/model';
import type { WorkspaceRepository } from './repository';
import type { ContextProvider } from './services';
const invoke = <T>(key:string,payload?:InvokePayload) => bridgeInvoke<T>(key,payload) as Promise<T>;
export const forgeRepository:WorkspaceRepository={
  list:()=>invoke('workspace.list'),
  async get(id){return (await invoke<Workspace|null>('workspace.get',{id}))??undefined;},
  save:(workspace,expected)=>invoke('workspace.save',{workspace,expected}),
  remove:(id,expected)=>invoke('workspace.remove',{id,expected}),
};
export const forgeContext:ContextProvider={
  search:(text)=>invoke('context.search',{text}),
  refresh:(product,id)=>invoke('context.refresh',{product,id}),
  issueTypes:(project)=>invoke('jira.types',{project}),
  createIssue:(input)=>invoke('jira.create',input),
};

import type { Source, TaskDraft } from '../shared/model';
import { demoSources } from './seed';
import { localRepository, type WorkspaceRepository } from './repository';
export type IssueFields={id:string;name:string;required:string[]};
export interface ContextProvider {
  search(text:string):Promise<{sources:Source[];warnings:string[]}>;
  refresh(product:Source['product'],id:string):Promise<Source>;
  issueTypes(project:string):Promise<IssueFields[]>;
  createIssue(input:{project:string;typeId:string;draft:TaskDraft;requestId:string}):Promise<Source>;
}
const unavailable=async():Promise<never>=>{throw new Error('Connect Trace through Forge to create real Jira issues.');};
const demoContext:ContextProvider={
  async search(){return {sources:demoSources,warnings:[]};},
  async refresh(product,id){
    const source=demoSources.find((item)=>item.product===product&&item.id===id);
    if(!source)throw new Error('This reference is unavailable.');
    return {...source,retrievedAt:Date.now()};
  },
  issueTypes:unavailable,createIssue:unavailable,
};
export type Mode='Demo'|'Convex'|'Atlassian';
export async function loadServices():Promise<{repository:WorkspaceRepository;context:ContextProvider;mode:Mode}> {
  if(import.meta.env.MODE==='forge'){
    const {forgeRepository,forgeContext}=await import('./forge');
    return {repository:forgeRepository,context:forgeContext,mode:'Atlassian'};
  }
  if(import.meta.env.DEV&&import.meta.env.VITE_TRACE_CONVEX==='true'){
    const {convexRepository}=await import('./convex');
    return {repository:convexRepository,context:demoContext,mode:'Convex'};
  }
  return {repository:localRepository,context:demoContext,mode:'Demo'};
}

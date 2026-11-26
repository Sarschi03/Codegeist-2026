import { mutationGeneric, queryGeneric, type QueryBuilder, type MutationBuilder, type GenericQueryCtx, type DataModelFromSchemaDefinition } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import { z } from 'zod';
import schema from './schema';
import { limits, summarize, validateWorkspace, type Scene, type WorkspaceSummary } from '../src/shared/model';

type Model=DataModelFromSchemaDefinition<typeof schema>;
const query:QueryBuilder<Model, "public"> = queryGeneric;
const mutation:MutationBuilder<Model, "public"> = mutationGeneric;
function authorize(secret:string) {
  const expected=process.env.TRACE_RELAY_SECRET;
  if(!expected || expected.length<32 || secret.length!==expected.length)throw new ConvexError('Unauthorized.');
  let difference=0;
  for(let i=0;i<expected.length;i++)difference|=expected.charCodeAt(i)^secret.charCodeAt(i);
  if(difference)throw new ConvexError('Unauthorized.');
  return 'trace-local-developer';
}
function find(ctx:GenericQueryCtx<Model>,owner:string,id:string) {
  if(!z.uuid().safeParse(id).success)throw new ConvexError('Invalid workspace ID.');
  return ctx.db.query('traceWorkspaces').withIndex('by_owner_id',(q)=>q.eq('owner',owner).eq('workspaceId',id)).unique();
}
export const list=query({args:{secret:v.string()},handler:async(ctx,{secret})=>{
  const owner=authorize(secret);
  return (await ctx.db.query('traceWorkspaces').withIndex('by_owner_updated',(q)=>q.eq('owner',owner)).order('desc').take(limits.workspaces))
    .map((row)=>JSON.parse(row.summary) as WorkspaceSummary);
}});
export const get=query({args:{secret:v.string(),id:v.string()},handler:async(ctx,{secret,id})=>{
  const owner=authorize(secret);
  const row=await find(ctx,owner,id);
  if(!row)return null;
  const assets=await ctx.db.query('traceAssets').withIndex('by_workspace',(q)=>q.eq('owner',owner).eq('workspaceId',id)).collect();
  const files=Object.fromEntries(assets.map((asset)=>[asset.assetId,JSON.parse(asset.data)])) as Scene['files'];
  return validateWorkspace({...JSON.parse(row.summary),scene:{...JSON.parse(row.scene),files}});
}});
export const save=mutation({args:{secret:v.string(),payload:v.string(),expected:v.union(v.number(),v.null())},handler:async(ctx,{secret,payload,expected})=>{
  const owner=authorize(secret);
  const workspace=validateWorkspace(JSON.parse(payload));
  const id=workspace.id;
  const row=await find(ctx,owner,id);
  if((row?.revision??null)!==expected)throw new ConvexError('This workspace changed elsewhere. Reopen it or export your draft.');
  if(!row && (await ctx.db.query('traceWorkspaces').withIndex('by_owner_updated',(q)=>q.eq('owner',owner)).take(limits.workspaces)).length>=limits.workspaces)
    throw new ConvexError('Workspace limit reached.');
  const saved={...workspace,revision:(expected??0)+1,updatedAt:Date.now()};
  const {files,...scene}=saved.scene;
  const existing=await ctx.db.query('traceAssets').withIndex('by_workspace',(q)=>q.eq('owner',owner).eq('workspaceId',id)).collect();
  const byId=new Map(existing.map((asset)=>[asset.assetId,asset]));
  for(const [assetId,file] of Object.entries(files)){
    const data=JSON.stringify(file);
    const asset=byId.get(assetId);
    if(!asset)await ctx.db.insert('traceAssets',{owner,workspaceId:id,assetId,data});
    else if(asset.data!==data)await ctx.db.patch(asset._id,{data});
  }
  for(const asset of existing)if(!Object.hasOwn(files,asset.assetId))await ctx.db.delete(asset._id);
  const write={owner,workspaceId:id,updatedAt:saved.updatedAt,revision:saved.revision,summary:JSON.stringify(summarize(saved)),scene:JSON.stringify(scene)};
  if(row)await ctx.db.replace(row._id,write);else await ctx.db.insert('traceWorkspaces',write);
  return summarize(saved);
}});
export const remove=mutation({args:{secret:v.string(),id:v.string(),expected:v.number()},handler:async(ctx,{secret,id,expected})=>{
  const owner=authorize(secret);
  const row=await find(ctx,owner,id);
  if(!row||row.revision!==expected)throw new ConvexError('This workspace changed elsewhere. Refresh and try again.');
  const assets=await ctx.db.query('traceAssets').withIndex('by_workspace',(q)=>q.eq('owner',owner).eq('workspaceId',id)).collect();
  for(const asset of assets)await ctx.db.delete(asset._id);
  await ctx.db.delete(row._id);
  return null;
}});

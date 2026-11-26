import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
export default defineSchema({
  traceWorkspaces:defineTable({owner:v.string(),workspaceId:v.string(),updatedAt:v.number(),revision:v.number(),summary:v.string(),scene:v.string()})
    .index('by_owner_id',['owner','workspaceId']).index('by_owner_updated',['owner','updatedAt']),
  traceAssets:defineTable({owner:v.string(),workspaceId:v.string(),assetId:v.string(),data:v.string()})
    .index('by_workspace',['owner','workspaceId']).index('by_workspace_asset',['owner','workspaceId','assetId']),
});

import { z } from "zod";
import { analyze, generateTasks, rankSources } from "../shared/intelligence";
import {
  bytes,
  emptyScene,
  workspaceSchema,
  type Scene,
} from "../shared/model";
import { search, siteRoot } from "./atlassian";
import { get, ownerKey } from "./workspaces";

type AgentContext = { accountId?: string; siteUrl?: string };
const selectionSchema = z.object({
  elements: workspaceSchema.shape.scene.shape.elements,
  annotations: workspaceSchema.shape.scene.shape.annotations,
  selectedIds: z.array(z.string()).max(100).optional(),
});
function selection(value: unknown) {
  const serialized = z.string().max(90_000).parse(value);
  if (bytes(serialized) > 110_000)
    throw new Error("Select a smaller part of the canvas.");
  const data = selectionSchema.parse(JSON.parse(serialized));
  const scene: Scene = {
    ...emptyScene(),
    elements: data.elements,
    annotations: data.annotations,
  };
  return analyze(scene, data.selectedIds ?? []);
}
export async function workspaceContext(
  payload: unknown,
  context: AgentContext,
) {
  const { workspaceId } = z.object({ workspaceId: z.uuid() }).parse(payload);
  const record = await get(ownerKey(context.accountId), workspaceId);
  if (!record) throw new Error("This workspace is unavailable.");
  const result = analyze({ ...record.scene, files: {} }, []);
  return {
    name: record.name,
    revision: record.revision,
    selectionText: result.text.slice(0, 4000),
    nodes: result.nodes.slice(0, 20),
    edges: result.edges.slice(0, 30),
  };
}
export function analyzeSelection(payload: unknown, context: AgentContext) {
  ownerKey(context.accountId);
  const { serializedSelection } = z
    .object({ serializedSelection: z.string() })
    .parse(payload);
  const result = selection(serializedSelection);
  return {
    nodes: result.nodes.slice(0, 30),
    edges: result.edges.slice(0, 40),
    notes: result.annotations.slice(0, 15).map((item) => item.note),
    text: result.text.slice(0, 4000),
  };
}
export async function relatedWork(payload: unknown, context: AgentContext) {
  ownerKey(context.accountId);
  const { query } = z
    .object({ query: z.string().trim().min(1).max(1000) })
    .parse(payload);
  const { sources, warnings } = await search(query, siteRoot(context.siteUrl));
  return { matches: rankSources(query, sources).slice(0, 6), warnings };
}
export async function draftSelection(payload: unknown, context: AgentContext) {
  ownerKey(context.accountId);
  const { serializedSelection } = z
    .object({ serializedSelection: z.string() })
    .parse(payload);
  const result = selection(serializedSelection);
  const query = result.text.trim().slice(0, 1200);
  const { sources, warnings } = query
    ? await search(query, siteRoot(context.siteUrl))
    : { sources: [], warnings: [] };
  return { drafts: generateTasks(result, sources), warnings };
}

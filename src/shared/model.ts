import { z } from 'zod';

export const templateNames = ['Blank canvas', 'Bug report', 'Feature brainstorming', 'Architecture diagram', 'Design review', 'User flow'] as const;
export type Template = (typeof templateNames)[number];
export const sourceSchema = z.object({
  id: z.string().max(200), product: z.enum(['Jira', 'Confluence']), title: z.string().max(500),
  description: z.string().max(3000), status: z.string().max(120), url: z.url().refine((url) => url.startsWith('https://')).optional(),
  related: z.array(z.string().max(200)).max(25), retrievedAt: z.number(),
});
export type Source = z.infer<typeof sourceSchema>;
export const annotationSchema = z.object({
  id: z.uuid(), elementId: z.string(), targetId: z.string().optional(), number: z.number().int().positive(),
  note: z.string().trim().min(1).max(2000), extractedText: z.string().max(4000), resolved: z.boolean(), linkedIssue: z.string().optional(),
});
export type Annotation = z.infer<typeof annotationSchema>;
export const sceneSchema = z.object({
  elements: z.array(z.object({
    id: z.string(), type: z.enum(['rectangle','diamond','ellipse','arrow','line','freedraw','text','image','frame','magicframe','embeddable','iframe','selection']),
    x: z.number(), y: z.number(), width: z.number(), height: z.number(), version: z.number(), isDeleted: z.boolean(),
  }).passthrough()).max(3500).transform((elements) => elements.filter((element) => !['iframe','embeddable','magicframe'].includes(element.type))),
  files: z.record(z.string(), z.object({
    id: z.string(), mimeType: z.enum(['image/png','image/jpeg','image/webp']),
    dataURL: z.string().regex(/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i), created: z.number(),
  }).refine((file) => file.dataURL.startsWith('data:' + file.mimeType + ';'))),
  annotations: z.array(annotationSchema).max(250),
  references: z.record(z.string(), z.object({
    source: sourceSchema, targetIds: z.array(z.string()).max(3500), provenance: z.literal('manual'),
  })),
});
export type Scene = z.infer<typeof sceneSchema>;
export const workspaceSchema = z.object({
  schemaVersion: z.literal(1), id: z.uuid(), name: z.string().trim().min(1).max(100),
  description: z.string().max(300), template: z.enum(templateNames), favorite: z.boolean(),
  createdAt: z.number(), updatedAt: z.number(), revision: z.number().int().nonnegative(), scene: sceneSchema,
});
export type Workspace = z.infer<typeof workspaceSchema>;
export type WorkspaceSummary = Omit<Workspace, 'scene'>;
export type TaskDraft = {
  title: string; description: string; issueType: string; criteria: string; missing: string;
  evidence: Source[]; elementIds: string[]; priority: string;
};
export const limits = { sceneBytes: 130_000, workspaceBytes: 6_000_000, images: 12, assetBytes: 450_000, uploadBytes: 15_000_000, workspaces: 40, searchResults: 20 };
export const emptyScene = (): Scene => ({ elements: [], files: {}, annotations: [], references: {} });
export const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;
export function validateWorkspace(input: unknown): Workspace {
  const workspace = workspaceSchema.parse(input);
  const { files, ...scene } = workspace.scene;
  if (bytes(scene) > limits.sceneBytes || bytes(files) > limits.workspaceBytes ||
      Object.keys(files).length > limits.images || Object.values(files).some((file) => bytes(file) > limits.assetBytes)) {
    throw new Error('This canvas exceeds its storage limit. Remove unused images or export a copy and split the board.');
  }
  return workspace;
}
export function summarize({ scene: _scene, ...workspace }: Workspace): WorkspaceSummary { return workspace; }

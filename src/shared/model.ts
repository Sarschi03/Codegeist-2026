import { z } from "zod";

export const templateNames = [
  "Blank canvas",
  "Bug report",
  "Feature brainstorming",
  "Architecture diagram",
  "Design review",
  "User flow",
] as const;
export type Template = (typeof templateNames)[number];
export const sourceSchema = z.object({
  id: z.string().max(200),
  product: z.enum(["Jira", "Confluence"]),
  title: z.string().max(500),
  description: z.string().max(3000),
  status: z.string().max(120),
  url: z
    .url()
    .refine((url) => url.startsWith("https://"))
    .optional(),
  related: z.array(z.string().max(200)).max(25),
  retrievedAt: z.number(),
});
export type Source = z.infer<typeof sourceSchema>;
export type JiraCreation = Source & { attachmentWarning?: string };
export type JiraIssueReceipt = { requestId: string; source: Source };
export const annotationSchema = z.object({
  id: z.uuid(),
  elementId: z.string(),
  targetId: z.string().optional(),
  number: z.number().int().positive(),
  region: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number().nonnegative(),
      height: z.number().nonnegative(),
    })
    .optional(),
  imageRegion: z
    .object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      width: z.number().min(0).max(1),
      height: z.number().min(0).max(1),
    })
    .optional(),
  note: z.string().trim().min(1).max(2000),
  extractedText: z.string().max(4000),
  resolved: z.boolean(),
  linkedIssue: z.string().optional(),
});
export type Annotation = z.infer<typeof annotationSchema>;
export const draftSchema = z.object({
  title: z.string().max(120),
  description: z.string().max(8000),
  issueType: z.string().max(80),
  criteria: z.string().max(2500),
  missing: z.string().max(1500),
  evidence: z.array(sourceSchema).max(10),
  elementIds: z.array(z.string()).max(100),
  priority: z.string().max(80),
});
export const sceneSchema = z.object({
  elements: z
    .array(
      z
        .object({
          id: z.string(),
          type: z.enum([
            "rectangle",
            "diamond",
            "ellipse",
            "arrow",
            "line",
            "freedraw",
            "text",
            "image",
            "frame",
            "magicframe",
            "embeddable",
            "iframe",
            "selection",
          ]),
          x: z.number(),
          y: z.number(),
          width: z.number(),
          height: z.number(),
          version: z.number(),
          isDeleted: z.boolean(),
          groupIds: z.array(z.string()).optional(),
          fileId: z.string().nullable().optional(),
          text: z.string().max(50_000).optional(),
          points: z.array(z.tuple([z.number(), z.number()])).optional(),
        })
        .passthrough(),
    )
    .max(3500)
    .transform((elements) =>
      elements.filter(
        (element) =>
          !["iframe", "embeddable", "magicframe"].includes(element.type),
      ),
    ),
  files: z.record(
    z.string(),
    z
      .object({
        id: z.string(),
        mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
        dataURL: z
          .string()
          .regex(/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i),
        created: z.number(),
      })
      .refine((file) => file.dataURL.startsWith("data:" + file.mimeType + ";")),
  ),
  annotations: z.array(annotationSchema).max(250),
  drafts: z
    .array(
      z.object({
        id: z.uuid(),
        draft: draftSchema,
        attempted: z.boolean().optional(),
      }),
    )
    .max(20)
    .optional(),
  references: z.record(
    z.string(),
    z.object({
      source: sourceSchema,
      targetIds: z.array(z.string()).max(3500),
      provenance: z.enum(["manual", "jira-created"]),
      createdFromDraftId: z.uuid().optional(),
    }),
  ),
});
export type Scene = z.infer<typeof sceneSchema>;
export const workspaceSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.uuid(),
  name: z.string().trim().min(1).max(100),
  description: z.string().max(300),
  template: z.enum(templateNames),
  favorite: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number(),
  revision: z.number().int().nonnegative(),
  scene: sceneSchema,
});
export type Workspace = z.infer<typeof workspaceSchema>;
export type WorkspaceSummary = Omit<Workspace, "scene">;
export type TaskDraft = z.infer<typeof draftSchema>;
export const limits = {
  sceneBytes: 130_000,
  workspaceBytes: 6_000_000,
  images: 12,
  assetBytes: 450_000,
  uploadBytes: 15_000_000,
  workspaces: 40,
  searchResults: 20,
};
export const emptyScene = (): Scene => ({
  elements: [],
  files: {},
  annotations: [],
  references: {},
});
export const bytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).length;
export function validateWorkspace(input: unknown): Workspace {
  const workspace = workspaceSchema.parse(input);
  workspace.scene.elements = workspace.scene.elements.map(
    ({ customData: _customData, link, ...element }) => ({
      ...element,
      link: typeof link === "string" && /^https:\/\//i.test(link) ? link : null,
    }),
  );
  const { files, ...scene } = workspace.scene;
  if (
    new Set(scene.elements.map((element) => element.id)).size !==
    scene.elements.length
  )
    throw new Error("The scene contains duplicate element IDs.");
  if (Object.entries(files).some(([key, file]) => key !== file.id))
    throw new Error("An image ID does not match its file.");
  if (
    bytes(scene) > limits.sceneBytes ||
    bytes(files) > limits.workspaceBytes ||
    Object.keys(files).length > limits.images ||
    Object.values(files).some((file) => bytes(file) > limits.assetBytes)
  ) {
    throw new Error(
      "This canvas exceeds its storage limit. Remove unused images or export a copy and split the board.",
    );
  }
  return workspace;
}
export function summarize({
  scene: _scene,
  ...workspace
}: Workspace): WorkspaceSummary {
  return workspace;
}

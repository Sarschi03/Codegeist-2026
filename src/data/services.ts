import type { JiraCreation, JiraIssueReceipt, Source } from "../shared/model";
import { rankSources } from "../shared/intelligence";
import { demoSources } from "./demoSources";
import { localRepository, type WorkspaceRepository } from "./repository";
export type IssueFields = { id: string; name: string; required: string[] };
export interface ContextProvider {
  openSource?(url: string): Promise<void>;
  search(text: string): Promise<{ sources: Source[]; warnings: string[] }>;
  refresh(product: Source["product"], id: string): Promise<Source>;
  graphLinks?(id: string): Promise<Source[]>;
  issueFields?(project: string, typeId: string): Promise<string[]>;
  issueTypes(project: string): Promise<IssueFields[]>;
  createIssue(input: {
    project: string;
    typeId: string;
    workspaceId: string;
    revision: number;
    attachScreenshot?: boolean;
    requestId: string;
  }): Promise<JiraCreation>;
  issueReceipts?(workspaceId: string): Promise<JiraIssueReceipt[]>;
}
const unavailable = async (): Promise<never> => {
  throw new Error("Connect Trace through Forge to create real Jira issues.");
};
const demoContext: ContextProvider = {
  async search(text) {
    return {
      sources: rankSources(text, demoSources).map(({ source }) => source),
      warnings: [],
    };
  },
  async refresh(product, id) {
    const source = demoSources.find(
      (item) => item.product === product && item.id === id,
    );
    if (!source) throw new Error("This reference is unavailable.");
    return { ...source, retrievedAt: Date.now() };
  },
  issueTypes: unavailable,
  createIssue: unavailable,
};
export type Mode = "Demo" | "Convex" | "Atlassian";
export async function loadServices(): Promise<{
  repository: WorkspaceRepository;
  context: ContextProvider;
  mode: Mode;
}> {
  if (import.meta.env.MODE === "forge") {
    const { forgeRepository, forgeContext } = await import("./forge");
    return {
      repository: forgeRepository,
      context: forgeContext,
      mode: "Atlassian",
    };
  }
  if (import.meta.env.DEV && import.meta.env.VITE_TRACE_CONVEX === "true") {
    const { convexRepository } = await import("./convex");
    return {
      repository: convexRepository,
      context: demoContext,
      mode: "Convex",
    };
  }
  return { repository: localRepository, context: demoContext, mode: "Demo" };
}

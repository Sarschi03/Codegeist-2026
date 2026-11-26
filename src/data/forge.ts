import { invoke as bridgeInvoke, router } from "@forge/bridge";
import {
  validateWorkspace,
  type Scene,
  type Workspace,
  type WorkspaceSummary,
} from "../shared/model";
import type { WorkspaceRepository } from "./repository";
import type { ContextProvider } from "./services";

const invoke = <T>(key: string, payload?: Record<string, unknown>) =>
  bridgeInvoke<T>(key, payload) as Promise<T>;
type ForgeWorkspace = Workspace & { assets: Record<string, string> };
const assetCache = new Map<string, Record<string, string>>();
async function prepareAsset(file: Scene["files"][string]) {
  const canonical = {
    id: file.id,
    mimeType: file.mimeType,
    dataURL: file.dataURL,
    created: file.created,
  };
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(canonical)),
  );
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return { file: canonical, hash };
}
export const forgeRepository: WorkspaceRepository = {
  list: () => invoke("workspace.list"),
  async get(id) {
    const value = await invoke<ForgeWorkspace | null>("workspace.get", { id });
    if (!value) return undefined;
    const { assets, ...board } = value;
    const files = Object.fromEntries(
      await Promise.all(
        Object.entries(assets).map(
          async ([fileId, hash]) =>
            [
              fileId,
              await invoke<Scene["files"][string]>("workspace.asset.read", {
                id,
                fileId,
                hash,
              }),
            ] as const,
        ),
      ),
    );
    assetCache.set(id, assets);
    return validateWorkspace({ ...board, scene: { ...board.scene, files } });
  },
  async save(input, expected) {
    const workspace = validateWorkspace(input);
    const { files, ...scene } = workspace.scene;
    const previous = assetCache.get(workspace.id) ?? {};
    const assets: Record<string, string> = {};
    for (const [fileId, file] of Object.entries(files)) {
      const asset = await prepareAsset(file);
      if (previous[fileId] !== asset.hash)
        await invoke("workspace.asset.write", { id: workspace.id, ...asset });
      assets[fileId] = asset.hash;
    }
    const summary = await invoke<WorkspaceSummary>("workspace.save", {
      workspace: { ...workspace, scene: { ...scene, files: {} } },
      expected,
      assets,
    });
    assetCache.set(workspace.id, assets);
    return { ...workspace, ...summary };
  },
  async remove(id, expected) {
    await invoke("workspace.remove", { id, expected });
    assetCache.delete(id);
  },
};
export const forgeContext: ContextProvider = {
  openSource: (url) => router.open(url),
  search: (text) => invoke("context.search", { text }),
  refresh: (product, id) => invoke("context.refresh", { product, id }),
  graphLinks: (id) => invoke("context.graph-links", { id }),
  issueTypes: (project) => invoke("jira.types", { project }),
  createIssue: (input) => invoke("jira.create", input),
};

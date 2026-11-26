import Dexie, { type Table } from "dexie";
import {
  limits,
  summarize,
  validateWorkspace,
  type Workspace,
  type WorkspaceSummary,
} from "../shared/model";

export interface WorkspaceRepository {
  list(): Promise<WorkspaceSummary[]>;
  get(id: string): Promise<Workspace | undefined>;
  save(workspace: Workspace, expected: number | null): Promise<Workspace>;
  remove(id: string, expected: number): Promise<void>;
}

class TraceDB extends Dexie {
  workspaces!: Table<Workspace, string>;
  recovery!: Table<Workspace, string>;
  constructor() {
    super("trace-visual-workspace");
    this.version(1).stores({ workspaces: "id, updatedAt", recovery: "id" });
  }
}
export const db = new TraceDB();
export const localRepository: WorkspaceRepository = {
  async list() {
    return (await db.workspaces.orderBy("updatedAt").reverse().toArray()).map(
      summarize,
    );
  },
  get: (id) => db.workspaces.get(id),
  async save(input, expected) {
    const workspace = validateWorkspace(input);
    return db.transaction("rw", db.workspaces, async () => {
      const current = await db.workspaces.get(workspace.id);
      if ((current?.revision ?? null) !== expected)
        throw new Error(
          "This workspace changed elsewhere. Open it again or keep a copy of your draft.",
        );
      if (!current && (await db.workspaces.count()) >= limits.workspaces)
        throw new Error("Workspace limit reached.");
      const next = {
        ...workspace,
        revision: (expected ?? 0) + 1,
        updatedAt: Date.now(),
      };
      await db.workspaces.put(next);
      return next;
    });
  },
  async remove(id, expected) {
    await db.transaction("rw", db.workspaces, async () => {
      const current = await db.workspaces.get(id);
      if (current?.revision !== expected)
        throw new Error(
          "This workspace changed elsewhere. Refresh and try again.",
        );
      await db.workspaces.delete(id);
    });
  },
};

import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyScene, type Workspace } from "../src/shared/model";
import { get, ownerKey, save } from "../src/forge/workspaces";

const store = vi.hoisted(() => new Map<string, unknown>());
vi.mock("@forge/kvs", () => ({
  kvs: {
    get: async (key: string) => store.get(key),
    set: async (
      key: string,
      value: unknown,
      options?: { keyPolicy?: string },
    ) => {
      if (options?.keyPolicy === "FAIL_IF_EXISTS" && store.has(key))
        throw new Error("Already exists");
      store.set(key, value);
    },
    delete: async (key: string) => {
      store.delete(key);
    },
    query: () => ({
      where: (_name: string, prefix: string) => ({
        limit: () => ({
          getMany: async () => ({
            results: [...store]
              .filter(([key]) => key.startsWith(prefix))
              .map(([key, value]) => ({ key, value })),
          }),
        }),
      }),
    }),
  },
  WhereConditions: { beginsWith: (prefix: string) => prefix },
}));

const makeBoard = (): Workspace => ({
  id: crypto.randomUUID(),
  name: "Private board",
  description: "",
  schemaVersion: 1,
  template: "Blank canvas",
  favorite: false,
  createdAt: 1,
  updatedAt: 1,
  revision: 0,
  scene: emptyScene(),
});

beforeEach(() => store.clear());
describe("Forge owner boundaries", () => {
  it("requires an authenticated account and isolates private boards", async () => {
    expect(() => ownerKey(undefined)).toThrow(/Sign in/);
    const alice = ownerKey("alice");
    const bob = ownerKey("bob");
    const board = makeBoard();
    await save(alice, { workspace: board, expected: null, assets: {} });
    expect(await get(alice, board.id)).toMatchObject({
      id: board.id,
      revision: 1,
    });
    expect(await get(bob, board.id)).toBeNull();
    await expect(
      save(bob, { workspace: board, expected: 1, assets: {} }),
    ).rejects.toThrow(/changed elsewhere/);
  });
  it("rejects stale saves and strips cached provider details", async () => {
    const owner = ownerKey("alice");
    const board = makeBoard();
    board.scene.references.marker = {
      provenance: "manual",
      targetIds: [],
      source: {
        id: "PAY-156",
        product: "Jira",
        title: "Private title",
        description: "Private text",
        status: "Active",
        related: ["PAY-111"],
        retrievedAt: 1,
      },
    };
    await save(owner, { workspace: board, expected: null, assets: {} });
    const stored = await get(owner, board.id);
    expect(stored?.scene.references.marker.source).toMatchObject({
      title: "PAY-156",
      description: "",
      status: "Refresh required",
      related: [],
    });
    await expect(
      save(owner, { workspace: board, expected: null, assets: {} }),
    ).rejects.toThrow(/changed elsewhere/);
  });
});

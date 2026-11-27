import { beforeEach, describe, expect, it, vi } from "vitest";
import { createIssue, issueReceipts } from "../src/forge/atlassian";
import { emptyScene, type Workspace } from "../src/shared/model";

const tools = vi.hoisted(() => ({
  getBoard: vi.fn(),
  jira: vi.fn(),
  image: vi.fn(),
  kvs: new Map<string, unknown>(),
}));
vi.mock("../src/forge/workspaces", () => ({
  get: tools.getBoard,
  readAsset: tools.image,
}));
vi.mock("@forge/api", () => ({
  default: { asUser: () => ({ requestJira: tools.jira }) },
  route(parts: TemplateStringsArray, ...values: string[]) {
    return parts.reduce(
      (path, part, index) =>
        path + (index ? encodeURIComponent(values[index - 1]) : "") + part,
      "",
    );
  },
}));
vi.mock("@forge/kvs", () => ({
  kvs: {
    get: async (key: string) => tools.kvs.get(key),
    set: async (
      key: string,
      value: unknown,
      options?: { keyPolicy?: string },
    ) => {
      if (options?.keyPolicy === "FAIL_IF_EXISTS" && tools.kvs.has(key))
        throw new Error("Exists");
      tools.kvs.set(key, value);
    },
    delete: async (key: string) => {
      tools.kvs.delete(key);
    },
  },
}));
const request = {
  workspaceId: "4bfe1b8f-2c31-44b4-bf35-8447bfc0a006",
  requestId: "7cc1bc99-9093-43ce-b6e0-7460584d6259",
  revision: 2,
  project: "PAY",
  typeId: "10001",
};
const issue = {
  id: "10010",
  key: "PAY-7",
  fields: {
    summary: "Payment button below the fold",
    status: { name: "Open" },
  },
};
const board: Workspace = {
  id: request.workspaceId,
  revision: 2,
  schemaVersion: 1,
  name: "Checkout",
  template: "Blank canvas",
  favorite: false,
  description: "",
  createdAt: 1,
  updatedAt: 2,
  scene: {
    ...emptyScene(),
    drafts: [
      {
        id: request.requestId,
        draft: {
          title: issue.fields.summary,
          description: "Affected on mobile",
          criteria: "Show the button",
          issueType: "Bug",
          priority: "Medium",
          missing: "Device type",
          elementIds: ["pin-1"],
          evidence: [],
        },
      },
    ],
    annotations: [
      {
        id: "cf2605dc-1ec7-4b13-b8c4-1dcada04b28e",
        elementId: "pin-1",
        targetId: "shot",
        number: 1,
        note: "Affected on mobile",
        extractedText: "",
        resolved: false,
      },
    ],
  },
};
const response = (payload: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => payload,
});
let marker: string;
let outcome: "success" | "ambiguous" | "denied";
beforeEach(() => {
  tools.kvs.clear();
  tools.image.mockReset();
  tools.getBoard
    .mockReset()
    .mockImplementation(async (owner: string, id: string) =>
      owner === "alice" && id === board.id ? board : null,
    );
  tools.jira.mockReset();
  marker = "";
  outcome = "success";
  tools.jira.mockImplementation(async (path: string, options?: RequestInit) => {
    if (path.includes("/createmeta/PAY/issuetypes/10001"))
      return response({
        fields: [
          { fieldId: "description", name: "Description", required: false },
          { fieldId: "summary", name: "Summary", required: true },
        ],
      });
    if (path.includes("/createmeta/PAY/issuetypes"))
      return response({ issueTypes: [{ id: "10001", name: "Bug" }] });
    if (path === "/rest/api/3/issue" && options?.method === "POST") {
      if (outcome === "denied") return response({}, 403);
      marker = JSON.parse(String(options.body)).properties[0].value.token;
      if (outcome === "ambiguous") throw new Error("Connection interrupted");
      return response({ key: issue.key }, 201);
    }
    if (path.endsWith("/properties/trace-issue-creation"))
      return response({ value: { token: marker } });
    if (path.endsWith("/search/jql")) return response({ issues: [issue] });
    if (path.startsWith("/rest/api/3/issue/PAY-7")) return response(issue);
    throw new Error("Unexpected Jira request: " + path);
  });
});
const writes = () =>
  tools.jira.mock.calls.filter(([path]) => path === "/rest/api/3/issue");

describe("Forge Jira create and recovery", () => {
  it("rejects a foreign workspace, stale revision and missing draft before Jira calls", async () => {
    await expect(createIssue("bob", request)).rejects.toThrow(/unavailable/);
    await expect(
      createIssue("alice", { ...request, revision: 1 }),
    ).rejects.toThrow(/changed/);
    await expect(
      createIssue("alice", { ...request, requestId: crypto.randomUUID() }),
    ).rejects.toThrow(/Save this draft/);
    expect(tools.jira).not.toHaveBeenCalled();
  });
  it("posts the saved draft in ADF and returns a durable, permission-checked receipt without posting twice", async () => {
    await expect(
      createIssue("alice", { ...request, draft: { title: "spoofed" } }),
    ).resolves.toMatchObject({ id: issue.key });
    const [write] = writes();
    const sent = JSON.parse(String(write[1].body));
    expect(sent.fields).toMatchObject({
      summary: issue.fields.summary,
      description: { type: "doc", version: 1 },
    });
    expect(JSON.stringify(sent.fields.description)).toContain(
      "Annotation 1, canvas element shot",
    );
    expect(sent.properties[0].value.token).toMatch(/^[a-f0-9]{64}$/);
    await expect(
      issueReceipts("alice", { workspaceId: board.id }),
    ).resolves.toMatchObject([
      { requestId: request.requestId, source: { id: issue.key } },
    ]);
    await expect(
      issueReceipts("bob", { workspaceId: board.id }),
    ).rejects.toThrow(/unavailable/);
    await expect(createIssue("alice", request)).resolves.toMatchObject({
      id: issue.key,
    });
    expect(writes()).toHaveLength(1);
  });
  it("recovers a lost Jira response by checking the indexed property without another POST", async () => {
    outcome = "ambiguous";
    await expect(createIssue("alice", request)).rejects.toThrow(
      "Connection interrupted",
    );
    await expect(createIssue("alice", request)).resolves.toMatchObject({
      id: issue.key,
    });
    expect(writes()).toHaveLength(1);
  });
  it("keeps the issue receipt if the explicitly requested Jira attachment fails", async () => {
    tools.getBoard.mockResolvedValueOnce({
      ...board,
      assets: { image: "bound-hash" },
      scene: {
        ...board.scene,
        elements: [
          {
            id: "shot",
            type: "image",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            isDeleted: false,
            version: 1,
            fileId: "image",
          },
        ],
      },
    });
    tools.image.mockResolvedValueOnce({
      id: "image",
      mimeType: "image/png",
      dataURL: "data:image/png;base64,iVBORw0KGgo=",
      created: 1,
    });
    const regular = tools.jira.getMockImplementation()!;
    tools.jira.mockImplementation(
      async (path: string, options?: RequestInit) =>
        path.endsWith("/attachments")
          ? response({}, 403)
          : regular(path, options),
    );
    const created = await createIssue("alice", {
      ...request,
      attachScreenshot: true,
    });
    expect(created).toMatchObject({
      id: issue.key,
      attachmentWarning: expect.stringContaining("could not be confirmed"),
    });
    const attachment = tools.jira.mock.calls.find(([path]) =>
      path.endsWith("/attachments"),
    );
    expect(attachment?.[1].headers["X-Atlassian-Token"]).toBe("no-check");
    expect(attachment?.[1].body).toBeInstanceOf(ArrayBuffer);
    await expect(createIssue("alice", request)).resolves.toMatchObject({
      id: issue.key,
    });
    expect(writes()).toHaveLength(1);
  });
  it("releases the receipt for a definite rejected create so the user can retry", async () => {
    outcome = "denied";
    await expect(createIssue("alice", request)).rejects.toThrow(/permissions/);
    outcome = "success";
    await expect(createIssue("alice", request)).resolves.toMatchObject({
      id: issue.key,
    });
    expect(writes()).toHaveLength(2);
  });
});

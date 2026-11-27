import { createHash, randomUUID } from "node:crypto";
import { get, readAsset } from "./workspaces";
import api, { route, type APIResponse } from "@forge/api";
import { kvs } from "@forge/kvs";
import { z } from "zod";
import {
  draftSchema,
  limits,
  sourceSchema,
  type JiraIssueReceipt,
  type JiraCreation,
  type Source,
} from "../shared/model";
import { keywords } from "../shared/intelligence";

const optionalString = z.string().optional();
const headers = { Accept: "application/json" };
const jsonHeaders = { ...headers, "Content-Type": "application/json" };
const issueKey = z.string().regex(/^[A-Z][A-Z0-9_]{1,29}-\d{1,15}$/);
const projectKey = z.string().regex(/^[A-Z][A-Z0-9_]{1,29}$/);
const pageId = z.string().regex(/^\d{1,20}$/);
const issueTypeId = z.string().regex(/^\d{1,20}$/);
const adfSchema = z.object({
  text: optionalString,
  content: z.array(z.unknown()).optional(),
});
const sourcePrefix = "conf:";
const jiraIssue = z.object({
  id: z.string(),
  self: optionalString,
  key: issueKey,
  fields: z.object({
    summary: z.string(),
    description: z.unknown().optional(),
    status: z.object({ name: z.string() }).nullable().optional(),
    issuelinks: z
      .array(
        z.object({
          inwardIssue: z.object({ key: issueKey }).optional(),
          outwardIssue: z.object({ key: issueKey }).optional(),
        }),
      )
      .optional(),
  }),
});
const confluenceResult = z.object({
  title: z.string(),
  excerpt: optionalString,
  url: optionalString,
  content: z.object({ id: pageId, title: optionalString }),
});
const pageSchema = z.object({
  id: pageId,
  title: z.string(),
  status: optionalString,
  _links: z.object({ webui: optionalString, base: optionalString }).optional(),
  body: z
    .object({ storage: z.object({ value: z.string() }).optional() })
    .optional(),
});

function asText(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(
      /&(?:nbsp|amp|lt|gt|quot|#39);/g,
      (entity) =>
        ({
          "&nbsp;": " ",
          "&amp;": "&",
          "&lt;": "<",
          "&gt;": ">",
          "&quot;": '"',
          "&#39;": String.fromCharCode(39),
        })[entity] ?? " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}
function adfText(value: unknown, depth = 0): string {
  const node = adfSchema.safeParse(value);
  if (!node.success || depth > 12) return "";
  return (
    node.data.text ??
    node.data.content
      ?.slice(0, 40)
      .map((item) => adfText(item, depth + 1))
      .join(" ") ??
    ""
  );
}
export function siteRoot(value: unknown) {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.origin : undefined;
  } catch {
    return undefined;
  }
}
function sourceLink(site: string | undefined, relative: string | undefined) {
  if (!site || !relative?.startsWith("/") || relative.startsWith("//"))
    return undefined;
  const url = new URL(relative, site);
  return url.origin === site ? url.href : undefined;
}
function jiraSource(issue: z.infer<typeof jiraIssue>, site?: string) {
  return sourceSchema.parse({
    product: "Jira",
    id: issue.key,
    title: issue.fields.summary.slice(0, 500),
    description: adfText(issue.fields.description).slice(0, 1500),
    status: (issue.fields.status?.name ?? "Unknown").slice(0, 120),
    url: sourceLink(site ?? siteRoot(issue.self), "/browse/" + issue.key),
    related: (issue.fields.issuelinks ?? [])
      .flatMap((link) => link.inwardIssue?.key ?? link.outwardIssue?.key ?? [])
      .slice(0, 25),
    retrievedAt: Date.now(),
  });
}
function confluenceLink(path: string | undefined) {
  if (!path?.startsWith("/") || path.startsWith("//")) return undefined;
  return path.startsWith("/wiki/") ? path : "/wiki" + path;
}
class ApiError extends Error {
  constructor(
    public status: number,
    product: string,
  ) {
    super(
      status === 429
        ? product + " is rate limited. Try again in a moment."
        : [401, 403].includes(status)
          ? product +
            " access is unavailable. Check your permissions and app installation."
          : status === 404
            ? product + " item or project is unavailable."
            : product + " could not complete the request.",
    );
  }
}
async function read(response: APIResponse, product: string) {
  if (!response.ok) throw new ApiError(response.status, product);
  return response.json() as Promise<unknown>;
}

export async function search(text: string, site?: string) {
  const terms = keywords(z.string().trim().min(1).max(1200).parse(text)).slice(
    0,
    6,
  );
  const keys = [
    ...new Set(
      (text.toUpperCase().match(/\b[A-Z][A-Z0-9_]+-\d+\b/g) ?? []).filter(
        (key) => issueKey.safeParse(key).success,
      ),
    ),
  ].slice(0, 6);
  if (!terms.length && !keys.length) return { sources: [], warnings: [] };
  const jql =
    [
      ...(keys.length ? ["key in (" + keys.join(",") + ")"] : []),
      ...terms.map((term) => 'text ~ "' + term + '"'),
    ].join(" OR ") + " ORDER BY updated DESC";
  const cql =
    "type = page AND (" +
    (terms.length ? terms : keys)
      .map((term) => 'text ~ "' + term + '"')
      .join(" OR ") +
    ") ORDER BY lastmodified DESC";
  const jira = async () => {
    const result = await read(
      await api.asUser().requestJira(route`/rest/api/3/search/jql`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          jql,
          maxResults: limits.searchResults,
          fields: ["summary", "description", "status", "issuelinks"],
        }),
      }),
      "Jira",
    );
    return z
      .object({ issues: z.array(jiraIssue) })
      .parse(result)
      .issues.map((issue) => jiraSource(issue, site));
  };
  const confluence = async () => {
    const result = await read(
      await api
        .asUser()
        .requestConfluence(
          route`/wiki/rest/api/search?cql=${cql}&limit=${limits.searchResults}`,
          { headers },
        ),
      "Confluence",
    );
    const response = z
      .object({
        results: z.array(confluenceResult),
        _links: z.object({ base: optionalString }).optional(),
      })
      .parse(result);
    return response.results.map((item): Source => ({
      product: "Confluence",
      id: sourcePrefix + item.content.id,
      title: asText(item.content.title ?? item.title).slice(0, 500),
      description: asText(item.excerpt ?? "").slice(0, 1000),
      status: "Current",
      url: sourceLink(
        site ?? siteRoot(response._links?.base),
        confluenceLink(item.url),
      ),
      related: [],
      retrievedAt: Date.now(),
    }));
  };
  const settled = await Promise.allSettled([jira(), confluence()]);
  return {
    sources: settled.flatMap((result) =>
      result.status === "fulfilled" ? result.value : [],
    ),
    warnings: settled.flatMap((result, index) =>
      result.status === "rejected"
        ? [
            result.reason instanceof ApiError
              ? result.reason.message
              : (index === 0 ? "Jira" : "Confluence") +
                " could not be reached or is unavailable for this installation.",
          ]
        : [],
    ),
  };
}

export async function refresh(
  product: Source["product"],
  id: string,
  site?: string,
): Promise<Source> {
  if (product === "Jira") {
    const key = issueKey.parse(id);
    const result = await read(
      await api
        .asUser()
        .requestJira(
          route`/rest/api/3/issue/${key}?fields=summary,description,status,issuelinks`,
          { headers },
        ),
      "Jira",
    );
    return jiraSource(jiraIssue.parse(result), site);
  }
  const page = pageId.parse(id.replace(/^conf:/, ""));
  const result = await read(
    await api
      .asUser()
      .requestConfluence(
        route`/wiki/api/v2/pages/${page}?body-format=storage`,
        { headers },
      ),
    "Confluence",
  );
  const value = pageSchema.parse(result);
  return {
    product: "Confluence",
    id: sourcePrefix + value.id,
    title: value.title.slice(0, 500),
    description: asText(value.body?.storage?.value ?? "").slice(0, 1500),
    status: value.status ?? "Current",
    url: sourceLink(
      site ?? siteRoot(value._links?.base),
      confluenceLink(value._links?.webui),
    ),
    related: [],
    retrievedAt: Date.now(),
  };
}
const metadata = z.object({
  fieldId: optionalString,
  key: optionalString,
  name: z.string(),
  required: z.boolean(),
  hasDefaultValue: z.boolean().optional(),
});
const supported = new Set([
  "summary",
  "description",
  "project",
  "issuetype",
  "reporter",
]);
async function requiredFields(project: string, typeId: string) {
  const result = await read(
    await api
      .asUser()
      .requestJira(
        route`/rest/api/3/issue/createmeta/${project}/issuetypes/${typeId}?maxResults=100`,
        { headers },
      ),
    "Jira",
  );
  const fields = z
    .object({
      fields: z.array(metadata).optional(),
      values: z.array(metadata).optional(),
      total: z.number().optional(),
    })
    .parse(result);
  const list = fields.fields ?? fields.values ?? [];
  return [
    ...(!list.some((item) => (item.fieldId ?? item.key) === "description")
      ? ["Description is missing from the create screen"]
      : []),
    ...list
      .filter(
        (item) =>
          item.required &&
          !item.hasDefaultValue &&
          !supported.has(item.fieldId ?? item.key ?? ""),
      )
      .map((item) => item.name),
    ...((fields.total ?? 0) > list.length ? ["Additional Jira fields"] : []),
  ];
}
async function listIssueTypes(input: unknown) {
  const project = projectKey.parse(input);
  const result = await read(
    await api
      .asUser()
      .requestJira(
        route`/rest/api/3/issue/createmeta/${project}/issuetypes?maxResults=20`,
        { headers },
      ),
    "Jira",
  );
  const parsed = z
    .object({
      issueTypes: z.array(
        z.object({
          id: issueTypeId,
          name: z.string(),
          subtask: z.boolean().optional(),
          hierarchyLevel: z.number().optional(),
        }),
      ),
    })
    .parse(result);
  const types = parsed.issueTypes
    .filter((item) => !item.subtask && (item.hierarchyLevel ?? 0) === 0)
    .slice(0, 10);
  return types;
}
export async function issueTypes(input: unknown) {
  return (await listIssueTypes(input)).map(({ id, name }) => ({
    id,
    name,
    required: [],
  }));
}
export function issueFields(project: unknown, typeId: unknown) {
  return requiredFields(projectKey.parse(project), issueTypeId.parse(typeId));
}

async function attachScreenshot(
  issue: string,
  file: Awaited<ReturnType<typeof readAsset>>,
) {
  const boundary = "trace-" + randomUUID();
  const extension =
    file.mimeType === "image/jpeg" ? "jpg" : file.mimeType.split("/")[1];
  const bytes = Buffer.from(file.dataURL.split(",")[1], "base64");
  const body = Uint8Array.from(
    Buffer.concat([
      Buffer.from(
        "--" +
          boundary +
          '\r\nContent-Disposition: form-data; name="file"; filename="trace-screenshot.' +
          extension +
          '"\r\nContent-Type: ' +
          file.mimeType +
          "\r\n\r\n",
      ),
      bytes,
      Buffer.from("\r\n--" + boundary + "--\r\n"),
    ]),
  ).buffer;
  const result = await api
    .asUser()
    .requestJira(route`/rest/api/3/issue/${issue}/attachments`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "multipart/form-data; boundary=" + boundary,
        "X-Atlassian-Token": "no-check",
      },
      body,
    });
  if (!result.ok) throw new ApiError(result.status, "Jira attachment");
}

const createInput = z.object({
  workspaceId: z.uuid(),
  revision: z.number().int().positive(),
  attachScreenshot: z.boolean().optional(),
  project: projectKey,
  typeId: issueTypeId,
  requestId: z.uuid(),
});
const receiptInput = z.object({ workspaceId: z.uuid() });
type Receipt = { project: string; typeId: string; issueKey?: string };
const receiptKey = (owner: string, workspaceId: string, requestId: string) =>
  ["jira-create", owner, workspaceId, requestId].join(":");
const legacyKey = (owner: string, requestId: string) =>
  "jira-request:" + owner + ":" + requestId;
const propertyName = "trace-issue-creation";
const tokenFor = (key: string) =>
  createHash("sha256").update(key).digest("hex");

async function recoverIssue(key: string, receipt: Receipt, site?: string) {
  if (receipt.issueKey) return refresh("Jira", receipt.issueKey, site);
  const jql =
    "project = " +
    receipt.project +
    ' AND traceCreationToken = "' +
    tokenFor(key) +
    '"';
  const response = await api
    .asUser()
    .requestJira(route`/rest/api/3/search/jql`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({
        jql,
        maxResults: 2,
        fields: ["summary", "description", "status", "issuelinks"],
      }),
    });
  const { issues } = z
    .object({ issues: z.array(jiraIssue) })
    .parse(await read(response, "Jira"));
  if (issues.length !== 1) return undefined;
  const issue = issues[0];
  const property = await api
    .asUser()
    .requestJira(
      route`/rest/api/3/issue/${issue.key}/properties/${propertyName}`,
      { headers },
    );
  const marker = z
    .object({ value: z.object({ token: z.string() }) })
    .parse(await read(property, "Jira"));
  if (marker.value.token !== tokenFor(key)) return undefined;
  await kvs.set(key, { ...receipt, issueKey: issue.key });
  return jiraSource(issue, site);
}

export async function issueReceipts(
  owner: string,
  input: unknown,
  site?: string,
): Promise<JiraIssueReceipt[]> {
  const { workspaceId } = receiptInput.parse(input);
  const board = await get(owner, workspaceId);
  if (!board) throw new Error("This workspace is unavailable.");
  const results = await Promise.allSettled(
    (board.scene.drafts ?? []).map(async ({ id: requestId }) => {
      const receipt =
        (await kvs.get<Receipt>(receiptKey(owner, workspaceId, requestId))) ??
        (await kvs.get<{ issueKey?: string }>(legacyKey(owner, requestId)));
      if (!receipt?.issueKey) return undefined;
      return {
        requestId,
        source: await refresh("Jira", receipt.issueKey, site),
      };
    }),
  );
  return results.flatMap((result) =>
    result.status === "fulfilled" && result.value ? [result.value] : [],
  );
}

export async function createIssue(
  owner: string,
  input: unknown,
  site?: string,
): Promise<JiraCreation> {
  const {
    workspaceId,
    revision,
    project,
    typeId,
    requestId,
    attachScreenshot: attach,
  } = createInput.parse(input);
  const board = await get(owner, workspaceId);
  if (!board) throw new Error("This workspace is unavailable.");
  const key = receiptKey(owner, workspaceId, requestId);
  const previous = await kvs.get<Receipt>(key);
  if (previous) {
    const recovered = await recoverIssue(key, previous, site);
    if (recovered) return recovered;
    throw new Error(
      "Jira may already have created this issue. Wait for Jira search to index it, then check this draft again. Trace will not send a second create request.",
    );
  }
  const legacy = await kvs.get<{ issueKey?: string }>(
    legacyKey(owner, requestId),
  );
  if (legacy?.issueKey) return refresh("Jira", legacy.issueKey, site);
  if (legacy)
    throw new Error(
      "An older Trace version already attempted this draft. Check Jira and link the existing issue from Context before creating anything again.",
    );
  if (board.revision !== revision)
    throw new Error(
      "This workspace changed. Reopen the latest revision and review the draft again.",
    );
  const entry = board.scene.drafts?.find(({ id }) => id === requestId);
  if (!entry)
    throw new Error(
      "Save this draft on the workspace before creating a Jira issue.",
    );
  // Draft text and source IDs come from the caller's saved board.
  const draft = draftSchema
    .extend({
      title: z.string().trim().min(1).max(120),
      description: z.string().trim().min(1).max(8000),
    })
    .parse(entry.draft);
  const supportedTypes = await listIssueTypes(project);
  if (!supportedTypes.some((type) => type.id === typeId))
    throw new Error("Select an issue type supported by this Jira project.");
  const required = await requiredFields(project, typeId);
  if (required.length)
    throw new Error("Jira create configuration: " + required.join(", "));

  const evidence = await Promise.allSettled(
    draft.evidence
      .slice(0, 5)
      .map((source) => refresh(source.product, source.id, site)),
  );
  const refs = evidence.flatMap((item) =>
    item.status === "fulfilled"
      ? [
          item.value.product +
            " " +
            item.value.id +
            (item.value.url ? " · " + item.value.url : ""),
        ]
      : [],
  );
  const annotations = board.scene.annotations.filter((item) =>
    draft.elementIds.includes(item.elementId),
  );
  let screenshot: Awaited<ReturnType<typeof readAsset>> | undefined;
  if (attach) {
    const target = board.scene.elements.find(
      (element) =>
        !element.isDeleted &&
        element.type === "image" &&
        annotations.some((item) => item.targetId === element.id),
    );
    const fileId = target?.fileId;
    const hash = fileId ? board.assets[fileId] : undefined;
    if (!fileId || !hash)
      throw new Error(
        "The draft screenshot is no longer available on this workspace.",
      );
    screenshot = await readAsset(owner, workspaceId, fileId, hash);
  }
  const origins = annotations.map(
    (item) =>
      "Annotation " +
      item.number +
      (item.targetId ? ", canvas element " + item.targetId : ""),
  );
  const text = [
    draft.description,
    draft.criteria ? "Acceptance criteria\n" + draft.criteria : "",
    draft.missing ? "Information to confirm\n" + draft.missing : "",
    refs.length ? "Source evidence\n" + refs.join("\n") : "",
    "Trace workspace: " +
      workspaceId +
      (origins.length ? "\n" + origins.join("\n") : ""),
  ]
    .filter(Boolean)
    .join("\n\n");
  const description = {
    version: 1,
    type: "doc",
    content: text
      .split("\n")
      .map((line) =>
        line
          ? { type: "paragraph", content: [{ type: "text", text: line }] }
          : { type: "paragraph" },
      ),
  };
  const receipt: Receipt = { project, typeId };
  // Acquire the request immediately before the irreversible call.
  try {
    await kvs.set(key, receipt, { keyPolicy: "FAIL_IF_EXISTS" });
  } catch {
    throw new Error(
      "Unable to start this Jira request. Reopen the draft to check whether it already ran.",
    );
  }
  const response = await api.asUser().requestJira(route`/rest/api/3/issue`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      fields: {
        project: { key: project },
        issuetype: { id: typeId },
        summary: draft.title,
        description,
      },
      properties: [{ key: propertyName, value: { token: tokenFor(key) } }],
    }),
  });
  if (
    !response.ok &&
    [400, 401, 403, 404, 422, 429].includes(response.status)
  ) {
    await kvs.delete(key);
  }
  const result = z
    .object({ key: issueKey, self: optionalString })
    .parse(await read(response, "Jira"));
  const receiptSaved = await kvs
    .set(key, { ...receipt, issueKey: result.key })
    .then(
      () => true,
      () => false,
    );
  const uploadConfirmedScreenshot = async () => {
    if (!screenshot) return undefined;
    try {
      await attachScreenshot(result.key, screenshot);
      return undefined;
    } catch {
      return "The issue was created, but the screenshot upload could not be confirmed. Check Attachments in Jira before uploading it again.";
    }
  };
  try {
    const source = await refresh("Jira", result.key, site);
    return { ...source, attachmentWarning: await uploadConfirmedScreenshot() };
  } catch {
    if (!receiptSaved)
      throw new Error(
        "Jira returned an issue key, but Trace could not save a receipt. Check this draft again after Jira indexes the issue.",
      );
    return {
      id: result.key,
      product: "Jira",
      title: draft.title,
      description: "",
      status: "Created",
      attachmentWarning: await uploadConfirmedScreenshot(),
      url: sourceLink(site ?? siteRoot(result.self), "/browse/" + result.key),
      related: [],
      retrievedAt: Date.now(),
    };
  }
}

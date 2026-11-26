import api, { route, type APIResponse } from "@forge/api";
import { kvs } from "@forge/kvs";
import { z } from "zod";
import { limits, sourceSchema, type Source } from "../shared/model";
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
      await api
        .asUser()
        .requestJira(route`/rest/api/3/search/jql`, {
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
export async function issueTypes(input: unknown) {
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
  return Promise.all(
    types.map(async ({ id, name }) => ({
      id,
      name,
      required: await requiredFields(project, id),
    })),
  );
}
const draftInput = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(8000),
  criteria: z.string().max(2500),
  missing: z.string().max(1500),
  evidence: z.array(sourceSchema).max(10),
});
export async function createIssue(
  owner: string,
  input: unknown,
  site?: string,
) {
  const { project, typeId, draft, requestId } = z
    .object({
      project: projectKey,
      typeId: issueTypeId,
      draft: draftInput,
      requestId: z.uuid(),
    })
    .parse(input);
  const lock = "jira-request:" + owner + ":" + requestId;
  const previous = await kvs.get<{ issueKey?: string }>(lock);
  if (previous?.issueKey) return refresh("Jira", previous.issueKey, site);
  if (previous)
    throw new Error(
      "The last request may have reached Jira. Check the project before creating another issue.",
    );
  const types = await issueTypes(project);
  const selected = types.find((type) => type.id === typeId);
  if (!selected || selected.required.length)
    throw new Error(
      "This project and issue type require additional Jira fields.",
    );
  try {
    await kvs.set(lock, { pending: true }, { keyPolicy: "FAIL_IF_EXISTS" });
  } catch {
    throw new Error("The same Jira creation request is already in progress.");
  }
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
            " · " +
            item.value.title +
            (item.value.url ? " · " + item.value.url : ""),
        ]
      : [],
  );
  const text = [
    draft.description,
    draft.criteria ? "Acceptance criteria\n" + draft.criteria : "",
    draft.missing ? "Information to confirm\n" + draft.missing : "",
    ...(refs.length ? ["Source evidence\n" + refs.join("\n")] : []),
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
          : { type: "paragraph", content: [] },
      ),
  };
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
    }),
  });
  if (!response.ok && [400, 401, 403, 404, 422, 429].includes(response.status))
    await kvs.delete(lock);
  const result = z
    .object({ key: issueKey })
    .parse(await read(response, "Jira"));
  await kvs.set(
    lock,
    { issueKey: result.key },
    { ttl: { unit: "DAYS", value: 30 } },
  );
  try {
    return await refresh("Jira", result.key, site);
  } catch {
    return {
      id: result.key,
      product: "Jira" as const,
      title: draft.title,
      description: "",
      status: "Created",
      url: sourceLink(site, "/browse/" + result.key),
      related: [],
      retrievedAt: Date.now(),
    };
  }
}

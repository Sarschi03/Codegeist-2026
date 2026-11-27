import { createHash } from "node:crypto";
import { kvs, WhereConditions } from "@forge/kvs";
import { z } from "zod";
import {
  bytes,
  limits,
  summarize,
  validateWorkspace,
  type Scene,
  type Source,
  type WorkspaceSummary,
} from "../shared/model";

const digest = (data: string) =>
  createHash("sha256").update(data).digest("hex");
export function ownerKey(accountId: unknown) {
  if (typeof accountId !== "string" || !accountId.length)
    throw new Error("Sign in to Atlassian to open Trace.");
  return digest(accountId).slice(0, 32);
}
const idSchema = z.uuid();
const fileKeySchema = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
function validImageSignature(mime: string, data: string) {
  const prefix = Buffer.from(data.split(",")[1].slice(0, 20), "base64");
  if (mime === "image/png")
    return prefix.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
  if (mime === "image/jpeg")
    return prefix.subarray(0, 3).toString("hex") === "ffd8ff";
  return (
    prefix.toString("ascii", 0, 4) === "RIFF" &&
    prefix.toString("ascii", 8, 12) === "WEBP"
  );
}
const dataSchema = z
  .object({
    id: fileKeySchema,
    mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
    dataURL: z
      .string()
      .regex(/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i),
    created: z.number(),
  })
  .refine(
    (file) =>
      file.dataURL.startsWith("data:" + file.mimeType + ";") &&
      bytes(file) <= limits.assetBytes &&
      validImageSignature(file.mimeType, file.dataURL),
  );
const assetsSchema = z
  .record(fileKeySchema, hashSchema)
  .refine((files) => Object.keys(files).length <= limits.images);
type RecordValue = {
  summary: WorkspaceSummary;
  scene: Omit<Scene, "files">;
  assets: Record<string, string>;
};
const boardKey = (owner: string, id: string) =>
  "board:" + owner + ":" + idSchema.parse(id);
const assetPrefix = (owner: string, id: string) =>
  "asset:" + owner + ":" + idSchema.parse(id) + ":";
const chunkSize = 145_000;

async function exclusive<T>(
  owner: string,
  operation: () => Promise<T>,
): Promise<T> {
  const key = "lock:" + owner;
  try {
    await kvs.set(key, Date.now(), {
      keyPolicy: "FAIL_IF_EXISTS",
      ttl: { unit: "SECONDS", value: 60 },
    });
  } catch {
    throw new Error("Workspace storage is busy. Retry in a moment.");
  }
  try {
    return await operation();
  } finally {
    await kvs.delete(key).catch(() => undefined);
  }
}
export async function list(owner: string) {
  const result = await kvs
    .query()
    .where("key", WhereConditions.beginsWith("board:" + owner + ":"))
    .limit(limits.workspaces)
    .getMany<RecordValue>();
  return result.results
    .map(({ value }) => value.summary)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
export async function get(owner: string, id: string) {
  const record = await kvs.get<RecordValue>(boardKey(owner, id));
  if (!record) return null;
  const { summary, scene, assets } = record;
  return { ...summary, scene: { ...scene, files: {} }, assets };
}

const stagePrefix = (owner: string, id: string, hash: string) =>
  "staged-data:" + owner + ":" + id + ":" + hash + ":";
const stageMarker = (owner: string, id: string, hash: string) =>
  "staged:" + owner + ":" + id + ":" + hash;
type Stage = { count: number; fileId: string };
const stageTtl = { unit: "HOURS", value: 1 } as const;

export async function writeAsset(owner: string, input: unknown) {
  const { id, file, hash } = z
    .object({ id: idSchema, file: dataSchema, hash: hashSchema })
    .parse(input);
  const serialized = JSON.stringify(file);
  if (digest(serialized) !== hash)
    throw new Error("The file checksum did not match. Try saving again.");
  await exclusive(owner, async () => {
    const permanent = assetPrefix(owner, id) + hash + ":";
    const marker = stageMarker(owner, id, hash);
    if (
      (await kvs.get<number>(permanent + "count")) ||
      (await kvs.get<Stage>(marker))
    )
      return;
    const active = await kvs
      .query()
      .where("key", WhereConditions.beginsWith("staged:" + owner + ":"))
      .limit(limits.images * 2)
      .getMany<Stage>();
    if (active.results.length >= limits.images * 2)
      throw new Error(
        "Too many unfinished image uploads. Save an open workspace or wait for the uploads to expire.",
      );
    const transaction = kvs.transact();
    const chunks =
      serialized.match(new RegExp(".{1," + chunkSize + "}", "gs")) ?? [];
    const prefix = stagePrefix(owner, id, hash);
    for (const [i, chunk] of chunks.entries())
      transaction.set(prefix + i, chunk, undefined, { ttl: stageTtl });
    await transaction
      .set(marker, { count: chunks.length, fileId: file.id }, undefined, {
        ttl: stageTtl,
      })
      .execute();
  });
}

async function verifiedChunks(prefix: string, count: number, hash: string) {
  if (!count || count > 4) throw new Error("A saved asset is incomplete.");
  const pieces = await Promise.all(
    Array.from({ length: count }, (_, index) =>
      kvs.get<string>(prefix + index),
    ),
  );
  const serialized = pieces.join("");
  if (digest(serialized) !== hash)
    throw new Error("A saved asset failed its integrity check.");
  return { pieces, file: dataSchema.parse(JSON.parse(serialized)) };
}

async function deleteChunks(prefix: string, count: number, marker: string) {
  await kvs.batchDelete([
    ...Array.from({ length: count }, (_, index) => ({ key: prefix + index })),
    { key: marker },
  ]);
}
export async function readAsset(
  owner: string,
  id: string,
  fileId: string,
  hash: string,
) {
  const board = await kvs.get<RecordValue>(boardKey(owner, id));
  if (
    !board ||
    board.assets[fileKeySchema.parse(fileId)] !== hashSchema.parse(hash)
  )
    throw new Error("This asset is no longer on the workspace.");
  const prefix = assetPrefix(owner, id) + hash + ":";
  const count = await kvs.get<number>(prefix + "count");
  return (await verifiedChunks(prefix, count ?? 0, hash)).file;
}
function stripped(source: Source): Source {
  return {
    ...source,
    title: source.product === "Jira" ? source.id : "Confluence page",
    description: "",
    status: "Refresh required",
    url: undefined,
    related: [],
  };
}
export async function save(owner: string, input: unknown) {
  const {
    expected,
    assets,
    workspace: raw,
  } = z
    .object({
      workspace: z.unknown(),
      expected: z.number().int().positive().nullable(),
      assets: assetsSchema,
    })
    .parse(input);
  const workspace = validateWorkspace(raw);
  if (Object.keys(workspace.scene.files).length)
    throw new Error("Upload files separately from the workspace scene.");
  return exclusive(owner, async () => {
    const key = boardKey(owner, workspace.id);
    const current = await kvs.get<RecordValue>(key);
    if ((current?.summary.revision ?? null) !== expected)
      throw new Error(
        "This workspace changed elsewhere. Reopen it or export your draft.",
      );
    if (!current && (await list(owner)).length >= limits.workspaces)
      throw new Error("Workspace limit reached.");
    const staged: {
      prefix: string;
      marker: string;
      count: number;
      pieces: (string | undefined)[];
      permanent: string;
    }[] = [];
    for (const [fileId, hash] of Object.entries(assets)) {
      if (current?.assets[fileId] === hash) continue;
      const prefix = assetPrefix(owner, workspace.id) + hash + ":";
      const count = await kvs.get<number>(prefix + "count");
      if (count) {
        if ((await verifiedChunks(prefix, count, hash)).file.id !== fileId)
          throw new Error("Image ID does not match its asset.");
        continue;
      }
      const marker = stageMarker(owner, workspace.id, hash);
      const entry = await kvs.get<Stage>(marker);
      if (!entry || entry.fileId !== fileId)
        throw new Error(
          "An image upload was interrupted. Save again to retry.",
        );
      const temporary = stagePrefix(owner, workspace.id, hash);
      const { pieces } = await verifiedChunks(temporary, entry.count, hash);
      staged.push({
        prefix: temporary,
        marker,
        count: entry.count,
        pieces,
        permanent: prefix,
      });
    }
    const { files: _files, ...scene } = workspace.scene;
    scene.references = Object.fromEntries(
      Object.entries(scene.references).map(([id, ref]) => [
        id,
        { ...ref, source: stripped(ref.source) },
      ]),
    );
    if (scene.drafts)
      scene.drafts = scene.drafts.map((item) => ({
        ...item,
        draft: { ...item.draft, evidence: item.draft.evidence.map(stripped) },
      }));
    const storedScene = JSON.parse(JSON.stringify(scene)) as typeof scene;
    const summary = summarize({
      ...workspace,
      revision: (expected ?? 0) + 1,
      updatedAt: Date.now(),
    });
    for (const { pieces, permanent } of staged) {
      const transaction = kvs.transact();
      pieces.forEach((piece, i) => transaction.set(permanent + i, piece));
      await transaction.set(permanent + "count", pieces.length).execute();
    }
    await kvs.set<RecordValue>(key, { summary, scene: storedScene, assets });
    // The new revision is committed. Old bytes and staging keys can now be reclaimed.
    await Promise.allSettled([
      ...staged.map(({ prefix, marker, count }) =>
        deleteChunks(prefix, count, marker),
      ),
      ...Object.values(current?.assets ?? {})
        .filter((hash) => !Object.values(assets).includes(hash))
        .map(async (hash) => {
          const prefix = assetPrefix(owner, workspace.id) + hash + ":";
          const count = await kvs.get<number>(prefix + "count");
          if (count && count <= 4)
            await deleteChunks(prefix, count, prefix + "count");
        }),
    ]);
    return summary;
  });
}
export async function remove(owner: string, id: string, expected: number) {
  await exclusive(owner, async () => {
    const key = boardKey(owner, id);
    const board = await kvs.get<RecordValue>(key);
    if (board?.summary.revision !== expected)
      throw new Error(
        "This workspace changed elsewhere. Refresh and try again.",
      );
    await kvs.delete(key);
    let cursor: string | undefined;
    do {
      const query = kvs
        .query()
        .where("key", WhereConditions.beginsWith(assetPrefix(owner, id)))
        .limit(20);
      const result = await (cursor ? query.cursor(cursor) : query).getMany();
      if (result.results.length)
        await kvs.batchDelete(
          result.results.map(({ key: assetKey }) => ({ key: assetKey })),
        );
      cursor = result.nextCursor;
    } while (cursor);
  });
}

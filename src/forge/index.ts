import Resolver from "@forge/resolver";
import { z } from "zod";
import * as workspaces from "./workspaces";
import { linkedPages } from "./graph";
import * as atlassian from "./atlassian";
const resolver = new Resolver();
const idPayload = z.object({ id: z.uuid() });
const contextProduct = z.enum(["Jira", "Confluence"]);
const identity = (context: { accountId?: string }) =>
  workspaces.ownerKey(context.accountId);
resolver.define("workspace.list", ({ context }) =>
  workspaces.list(identity(context)),
);
resolver.define("workspace.get", ({ context, payload }) =>
  workspaces.get(identity(context), idPayload.parse(payload).id),
);
resolver.define("workspace.save", ({ context, payload }) =>
  workspaces.save(identity(context), payload),
);
resolver.define("workspace.asset.write", ({ context, payload }) =>
  workspaces.writeAsset(identity(context), payload),
);
resolver.define("workspace.asset.read", ({ context, payload }) => {
  const { id, fileId, hash } = idPayload
    .extend({ fileId: z.string(), hash: z.string() })
    .parse(payload);
  return workspaces.readAsset(identity(context), id, fileId, hash);
});
resolver.define("workspace.remove", ({ context, payload }) => {
  const { id, expected } = idPayload
    .extend({ expected: z.number().int().positive() })
    .parse(payload);
  return workspaces.remove(identity(context), id, expected);
});
resolver.define("context.search", ({ context, payload }) => {
  identity(context);
  return atlassian.search(
    z.string().parse(payload.text),
    atlassian.siteRoot(context.siteUrl),
  );
});
resolver.define("context.refresh", ({ context, payload }) => {
  identity(context);
  const { product, id } = z
    .object({ product: contextProduct, id: z.string().max(200) })
    .parse(payload);
  return atlassian.refresh(product, id, atlassian.siteRoot(context.siteUrl));
});
resolver.define("context.graph-links", ({ context, payload }) => {
  identity(context);
  return linkedPages(context.cloudId, payload.id);
});
resolver.define("jira.types", ({ context, payload }) => {
  identity(context);
  return atlassian.issueTypes(payload.project);
});
resolver.define("jira.create", ({ context, payload }) =>
  atlassian.createIssue(
    identity(context),
    payload,
    atlassian.siteRoot(context.siteUrl),
  ),
);
export const handler = resolver.getDefinitions();

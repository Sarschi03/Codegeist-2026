import api from "@forge/api";
import { z } from "zod";
import { sourceSchema, type Source } from "../shared/model";

const linkedPagesQuery = `query traceLinkedPages($id: ID!) {
  confluencePageLinkedConfluencePages(id: $id, first: 8) {
    edges { node { ... on ConfluencePage { pageId title webUrl status } } }
  }
}`;
const resultSchema = z.object({
  errors: z.array(z.unknown()).optional(),
  data: z
    .object({
      confluencePageLinkedConfluencePages: z
        .object({
          edges: z.array(
            z.object({
              node: z
                .object({
                  pageId: z.string().nullish(),
                  title: z.string().nullish(),
                  webUrl: z.string().nullish(),
                  status: z.string().nullish(),
                })
                .nullish(),
            }),
          ),
        })
        .nullish(),
    })
    .nullish(),
});
export async function linkedPages(
  cloudId: unknown,
  sourceId: unknown,
): Promise<Source[]> {
  const site = z.uuid().parse(cloudId);
  const id = z
    .string()
    .regex(/^conf:\d{1,20}$/)
    .parse(sourceId)
    .slice(5);
  const response = await api
    .asUser()
    .requestTeamworkGraph(linkedPagesQuery, {
      id: "ari:cloud:confluence:" + site + ":page/" + id,
    });
  if (!response.ok)
    throw new Error(
      "Teamwork Graph could not be reached for this installation.",
    );
  const data = resultSchema.parse(await response.json());
  if (data.errors?.length)
    throw new Error(
      "Teamwork Graph is unavailable for this page or installation.",
    );
  return (data.data?.confluencePageLinkedConfluencePages?.edges ?? []).flatMap(
    ({ node }) => {
      if (!node?.pageId || !node.title || !/^[0-9]{1,20}$/.test(node.pageId))
        return [];
      const source = sourceSchema.safeParse({
        id: "conf:" + node.pageId,
        title: node.title.slice(0, 500),
        product: "Confluence",
        description: "Linked from the selected Confluence page.",
        status: node.status ?? "Current",
        url: node.webUrl ?? undefined,
        related: [],
        retrievedAt: Date.now(),
      });
      return source.success ? [source.data] : [];
    },
  );
}

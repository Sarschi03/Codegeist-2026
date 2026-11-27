import MiniSearch from "minisearch";
import type { Scene, Source, TaskDraft } from "./model";

const stop = new Set(
  "the this that with from into when then where should could would make keep more have been about their there also work".split(
    " ",
  ),
);
export function keywords(text: string) {
  return [
    ...new Set(
      (text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []).filter(
        (word) => !stop.has(word),
      ),
    ),
  ].slice(0, 12);
}
export const bindingId = (value: unknown) =>
  value && typeof value === "object" && "elementId" in value
    ? String(value.elementId)
    : "";
type Node = { id: string; label: string; dependsOn: string[] };
export function analyze(scene: Scene, ids: string[]) {
  const visible = scene.elements.filter((element) => !element.isDeleted);
  const visibleById = new Map(visible.map((element) => [element.id, element]));
  const selected = new Set(
    ids.length ? ids : visible.map((element) => element.id),
  );
  const selectedShapes = visible.filter(
    (shape) =>
      selected.has(shape.id) &&
      ["rectangle", "diamond", "ellipse"].includes(shape.type),
  );
  const annotations = scene.annotations.filter(
    (item) =>
      visibleById.has(item.elementId) &&
      (selected.has(item.elementId) ||
        (item.targetId && selected.has(item.targetId))),
  );
  const labels = visible.filter(
    (element) =>
      element.type === "text" &&
      typeof element.text === "string" &&
      (selected.has(element.id) ||
        (typeof element.containerId === "string" &&
          selected.has(element.containerId)) ||
        selectedShapes.some(
          (shape) =>
            element.x >= shape.x &&
            element.y >= shape.y &&
            element.x + element.width <= shape.x + shape.width + 3 &&
            element.y + element.height <= shape.y + shape.height + 3,
        )),
  );
  const nodes: Node[] = labels
    .map((element) => {
      const shape =
        visibleById.get(String(element.containerId)) ??
        selectedShapes.find(
          (candidate) =>
            element.x >= candidate.x &&
            element.y >= candidate.y &&
            element.x + element.width <= candidate.x + candidate.width + 2 &&
            element.y + element.height <= candidate.y + candidate.height + 2,
        );
      return {
        id: shape?.id ?? element.id,
        label: String(element.text),
        dependsOn: [],
      };
    })
    .filter((node) => node.label.trim().length > 2);
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const edges = visible
    .filter((element) => element.type === "arrow")
    .map((element) => ({
      from: bindingId(element.startBinding),
      to: bindingId(element.endBinding),
    }))
    .filter(({ from, to }) => nodeMap.has(from) && nodeMap.has(to));
  for (const { from, to } of edges)
    nodeMap.get(to)?.dependsOn.push(nodeMap.get(from)!.label);
  const refs = Object.entries(scene.references)
    .filter(
      ([id, ref]) =>
        visibleById.has(id) &&
        (selected.has(id) ||
          ref.targetIds.some((target) => selected.has(target))),
    )
    .map(([, ref]) => ref.source.id + " " + ref.source.title);
  const text = [
    ...annotations.flatMap((item) => [item.note, item.extractedText]),
    ...nodes.map((node) => node.label),
    ...refs,
  ]
    .filter(Boolean)
    .join("\n");
  return {
    nodes: [...nodeMap.values()],
    annotations,
    edges,
    text,
    ids: [...selected],
  };
}
export type Match = { source: Source; why: string; duplicate: boolean };
export function rankSources(text: string, sources: Source[]): Match[] {
  const terms = keywords(text);
  if (!terms.length) return [];
  const index = new MiniSearch<Source>({
    fields: ["title", "description", "id"],
    searchOptions: { boost: { title: 3, id: 5 }, prefix: true, fuzzy: 0.15 },
  });
  const unique = [
    ...new Map(sources.map((source) => [source.id, source])).values(),
  ];
  index.addAll(unique);
  const keys = new Set(
    text.toUpperCase().match(/\b[A-Z][A-Z0-9_]+-\d+\b/g) ?? [],
  );
  const scores = new Map(
    index.search(terms.join(" ")).map((item) => [String(item.id), item.score]),
  );
  const roots = unique.filter(
    (source) => keys.has(source.id) || scores.has(source.id),
  );
  return unique
    .flatMap((source) => {
      const exact = keys.has(source.id);
      const related = roots.find(
        (root) => root.id !== source.id && root.related.includes(source.id),
      );
      const score =
        (scores.get(source.id) ?? 0) + (exact ? 100 : 0) + (related ? 1 : 0);
      if (!score) return [];
      const common = terms.filter((term) =>
        (source.title + " " + source.description).toLowerCase().includes(term),
      );
      const duplicate =
        source.product === "Jira" &&
        (exact ||
          keywords(source.title).filter((word) => terms.includes(word))
            .length >= 2);
      return [
        {
          source,
          score,
          duplicate,
          why: exact
            ? "Issue key appears in the selection"
            : common.length
              ? "Matches " +
                common
                  .slice(0, 4)
                  .map((word) => "“" + word + "”")
                  .join(", ")
              : related
                ? "Linked from " + related.id
                : "Related terms in the source excerpt",
        },
      ];
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(({ source, why, duplicate }) => ({ source, why, duplicate }));
}
export const draftFormats = [
  "Auto",
  "Task",
  "Story",
  "Subtask",
  "Bug",
] as const;
export type DraftFormat = (typeof draftFormats)[number];
export function generateTasks(
  selection: ReturnType<typeof analyze>,
  sources: Source[],
  format: DraftFormat = "Auto",
): TaskDraft[] {
  const { annotations, nodes, edges, text, ids } = selection;
  if (!text.trim()) return [];
  const flow = edges.length
    ? nodes.filter((node) =>
        edges.some(({ from, to }) => [from, to].includes(node.id)),
      )
    : nodes.slice(0, 5);
  const evidenceFor = (value: string) =>
    rankSources(value, sources)
      .slice(0, 3)
      .map(({ source }) => source);
  const bugs: TaskDraft[] = annotations.slice(0, 5).map((item) => ({
    title: item.note.split("\n")[0].slice(0, 120),
    issueType: "Bug",
    priority: "Medium",
    description:
      "Observed feedback\n" +
      item.note +
      "\n\nExpected behavior\nConfirm with the reporter." +
      (item.extractedText ? "\n\nScreenshot text\n" + item.extractedText : ""),
    criteria:
      "Confirm expected behavior with the reporter.\nVerify the affected screen and viewport.",
    missing:
      "Expected behavior, reproduction steps and environment need confirmation.",
    elementIds: [item.elementId],
    evidence: evidenceFor(item.note + " " + item.extractedText),
  }));
  if (
    (format === "Auto" && bugs.length && !edges.length) ||
    (format === "Bug" && bugs.length)
  )
    return bugs;
  const issueType = format === "Auto" ? "Task" : format;
  return [
    ...(format === "Auto" ? bugs : []),
    ...(flow.length
      ? flow
      : [{ id: ids[0], label: text.split("\n")[0], dependsOn: [] }]
    )
      .slice(0, 6)
      .map((node): TaskDraft => ({
        title: (
          (format === "Bug"
            ? "Investigate "
            : format === "Story"
              ? "Support "
              : format === "Subtask"
                ? "Build step: "
                : "Implement ") + node.label
        ).slice(0, 120),
        issueType,
        priority: "Medium",
        description:
          (format === "Story"
            ? "User goal to confirm\nEnable the user to complete: "
            : format === "Bug"
              ? "Area to investigate\n"
              : format === "Subtask"
                ? "Parent issue needed\nImplementation step: "
                : "Implement the selected step: ") +
          node.label +
          (node.dependsOn.length
            ? "\n\nCanvas dependencies: " + node.dependsOn.join(", ")
            : ""),
        criteria:
          "Confirm the intended behavior.\nVerify inputs, outputs and transitions with the team.",
        missing:
          format === "Story"
            ? "Confirm the user role, goal and benefit."
            : format === "Subtask"
              ? "Confirm the parent Jira issue and scope."
              : format === "Bug"
                ? "Confirm observed and expected behavior and reproduction steps."
                : "Confirm implementation scope, edge cases and ownership.",
        elementIds: node.id ? [node.id] : [],
        evidence: evidenceFor(node.label + " " + text),
      })),
  ];
}
export function taskMarkdown(drafts: TaskDraft[]) {
  return drafts
    .map(
      (draft) =>
        "## " +
        draft.title +
        "\n\n" +
        draft.description +
        "\n\n### Acceptance criteria\n" +
        draft.criteria +
        "\n\n### Open questions\n" +
        draft.missing +
        "\n\n### Evidence\n" +
        draft.evidence
          .map(
            (source) =>
              "- " +
              source.title +
              (source.url ? " (" + source.url + ")" : " [" + source.id + "]"),
          )
          .join("\n"),
    )
    .join("\n\n");
}

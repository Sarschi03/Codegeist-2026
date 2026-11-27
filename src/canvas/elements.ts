import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  newElementWith,
} from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { Scene, Source } from "../shared/model";
export type Skeleton = NonNullable<
  Parameters<typeof convertToExcalidrawElements>[0]
>[number];
export function addElements(
  api: ExcalidrawImperativeAPI,
  items: Skeleton[],
  links: { arrowId: string; from: string; to: string }[] = [],
) {
  const added = convertToExcalidrawElements(items, { regenerateIds: false });
  const connected = new Map(links.map((link) => [link.arrowId, link]));
  const elements = [...api.getSceneElementsIncludingDeleted(), ...added].map(
    (element) => {
      const arrow = connected.get(element.id);
      if (arrow && element.type === "arrow")
        return newElementWith(element, {
          startBinding: { elementId: arrow.from, focus: 0, gap: 8 },
          endBinding: { elementId: arrow.to, focus: 0, gap: 8 },
        });
      const bind = links
        .filter(({ from, to }) => from === element.id || to === element.id)
        .map(({ arrowId: id }) => ({ id, type: "arrow" as const }));
      return bind.length
        ? newElementWith(element, {
            boundElements: [...(element.boundElements ?? []), ...bind],
          })
        : element;
    },
  );
  api.updateScene({ elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  return elements as unknown as Scene["elements"];
}
export function insertionPoint(
  api: ExcalidrawImperativeAPI,
  width: number,
  height: number,
) {
  const {
    scrollX,
    scrollY,
    zoom,
    width: viewWidth,
    height: viewHeight,
  } = api.getAppState();
  return {
    x: -scrollX + (viewWidth / zoom.value - width) / 2,
    y: -scrollY + (viewHeight / zoom.value - height) / 2,
  };
}
export function makeReference(
  id: string,
  x: number,
  y: number,
  source: Source,
): Skeleton[] {
  const groupId = crypto.randomUUID();
  return [
    {
      id,
      type: "rectangle",
      x,
      y,
      width: 302,
      height: 77,
      backgroundColor: "#f3edff",
      strokeColor: "#ac98dc",
      fillStyle: "solid",
      roundness: { type: 3 },
      strokeWidth: 1,
      roughness: 0,
      groupIds: [groupId],
    },
    {
      type: "text",
      x: x + 14,
      y: y + 12,
      text: source.product === "Jira" ? "JIRA / " + source.id : "CONFLUENCE",
      strokeColor: "#7256bc",
      fontSize: 12,
      fontFamily: 2,
      groupIds: [groupId],
    },
    {
      type: "text",
      x: x + 14,
      y: y + 39,
      text:
        source.title.length > 35
          ? source.title.slice(0, 34) + "…"
          : source.title,
      strokeColor: "#2e2251",
      fontSize: 15,
      fontFamily: 2,
      groupIds: [groupId],
    },
  ];
}

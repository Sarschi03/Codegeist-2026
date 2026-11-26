import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  CaptureUpdateAction,
  Excalidraw,
  viewportCoordsToSceneCoords,
} from "@excalidraw/excalidraw";
import type {
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import {
  Aperture,
  ArrowUpRight,
  Circle,
  Diamond,
  Eraser,
  Hand,
  ImagePlus,
  Minus,
  MousePointer2,
  Pencil,
  Square,
  StickyNote,
  Type,
} from "lucide-react";
import type { Scene } from "../shared/model";
import type { Theme } from "../components/Settings";
import { IconButton } from "../components/IconButton";
import type { Region } from "./images";

const tools = [
  ["selection", "Select (V)", MousePointer2],
  ["hand", "Pan (H)", Hand],
  ["freedraw", "Draw (P)", Pencil],
  ["rectangle", "Rectangle (R)", Square],
  ["ellipse", "Ellipse (O)", Circle],
  ["diamond", "Diamond (D)", Diamond],
  ["line", "Line (L)", Minus],
  ["arrow", "Arrow (A)", ArrowUpRight],
  ["text", "Text (T)", Type],
  ["eraser", "Eraser (E)", Eraser],
] as const;
export function CanvasStage({
  scene,
  theme,
  setAPI,
  onScene,
  onSelection,
  onImage,
  onRegion,
  onSticky,
  regionMode,
  regionHint,
}: {
  scene: Scene;
  theme: Theme;
  setAPI: (api: ExcalidrawImperativeAPI) => void;
  onScene: (elements: Scene["elements"], files: Scene["files"]) => void;
  onSelection: (ids: string[]) => void;
  onImage: (file: File) => void;
  onRegion: (region: Region) => void;
  onSticky: () => void;
  regionMode: boolean;
  regionHint: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [api, apiState] = useState<ExcalidrawImperativeAPI | null>(null);
  const [tool, setTool] = useState("selection");
  const [region, setRegion] = useState<Region | null>(null);
  const fitted = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const last = useRef({
    elements: scene.elements
      .map(
        (item) =>
          item.id +
          ":" +
          item.version +
          ":" +
          item.versionNonce +
          ":" +
          item.isDeleted,
      )
      .join(","),
    files: Object.keys(scene.files).join(","),
    selection: "",
  });
  const initial = useRef<ExcalidrawInitialDataState>({
    elements: scene.elements as unknown as ExcalidrawElement[],
    files: scene.files as unknown as BinaryFiles,
    appState: { viewBackgroundColor: "transparent", gridModeEnabled: false },
    scrollToContent: true,
  });
  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("input, textarea, [contenteditable]")
      )
        return;
      const image = [...(event.clipboardData?.items ?? [])]
        .find((item) => item.kind === "file" && item.type.startsWith("image/"))
        ?.getAsFile();
      if (!image) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onImage(image);
    };
    window.addEventListener("paste", paste, true);
    return () => window.removeEventListener("paste", paste, true);
  }, [onImage]);
  const position = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };
  const bounds = (
    a: { x: number; y: number },
    b: { x: number; y: number },
  ) => ({
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  });
  return (
    <div
      className="canvas-stage"
      ref={ref}
      data-testid="canvas-stage"
      onDragOverCapture={(event) => {
        if (event.dataTransfer.types.includes("Files")) event.preventDefault();
      }}
      onDropCapture={(event) => {
        const file = event.dataTransfer.files[0];
        if (file) {
          event.preventDefault();
          event.stopPropagation();
          onImage(file);
        }
      }}
    >
      <Excalidraw
        validateEmbeddable={false}
        theme={theme}
        initialData={initial.current}
        excalidrawAPI={(next) => {
          apiState(next);
          setAPI(next);
        }}
        UIOptions={{
          canvasActions: {
            changeViewBackgroundColor: false,
            clearCanvas: false,
            export: false,
            loadScene: false,
            saveToActiveFile: false,
            toggleTheme: false,
            saveAsImage: false,
          },
          tools: { image: false },
        }}
        onChange={(elements, state, files) => {
          const ids = Object.keys(state.selectedElementIds).filter(
            (id) => state.selectedElementIds[id],
          );
          const selection = ids.join(",");
          if (last.current.selection !== selection) {
            last.current.selection = selection;
            onSelection(ids);
          }
          setTool(state.activeTool.type);
          if (state.isLoading) return;
          if (!fitted.current && api && elements.length) {
            fitted.current = true;
            requestAnimationFrame(() =>
              api.scrollToContent(undefined, {
                fitToContent: true,
                viewportZoomFactor: 0.8,
              }),
            );
          }
          const kept = new Set<string>(
            elements.flatMap((item) =>
              item.type === "image" && !item.isDeleted && item.fileId
                ? [item.fileId]
                : [],
            ),
          );
          const relevantFiles = Object.fromEntries(
            Object.entries(files).filter(([id]) => kept.has(id)),
          );
          const signature = elements
            .map(
              (item) =>
                item.id +
                ":" +
                item.version +
                ":" +
                item.versionNonce +
                ":" +
                item.isDeleted,
            )
            .join(",");
          const fileKeys = Object.keys(relevantFiles).join(",");
          if (
            last.current.elements === signature &&
            last.current.files === fileKeys
          )
            return;
          last.current = { elements: signature, files: fileKeys, selection };
          onScene(
            elements as unknown as Scene["elements"],
            relevantFiles as Scene["files"],
          );
        }}
      />
      <nav className="canvas-rail" aria-label="Drawing tools">
        {tools.map(([id, label, Icon]) => (
          <IconButton
            key={id}
            label={label}
            aria-pressed={tool === id && !regionMode}
            className={tool === id && !regionMode ? "selected" : ""}
            onClick={() => api?.setActiveTool({ type: id })}
          >
            <Icon size={17} />
          </IconButton>
        ))}
        <div className="rail-divider" />
        <IconButton label="Insert sticky note" onClick={onSticky}>
          <StickyNote size={17} />
        </IconButton>
        <IconButton
          label="Upload image"
          onClick={() => picker.current?.click()}
        >
          <ImagePlus size={17} />
        </IconButton>
        <IconButton
          label="Fit to canvas"
          onClick={() =>
            api?.scrollToContent(undefined, {
              fitToContent: true,
              viewportZoomFactor: 0.82,
            })
          }
        >
          <Aperture size={17} />
        </IconButton>
      </nav>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        ref={picker}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onImage(file);
          event.target.value = "";
        }}
      />
      {regionMode && (
        <div
          className="region-overlay"
          aria-label="Draw an annotation region"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            start.current = position(event);
            setRegion(bounds(start.current, start.current));
          }}
          onPointerMove={(event) => {
            if (start.current)
              setRegion(bounds(start.current, position(event)));
          }}
          onPointerCancel={() => {
            start.current = null;
            setRegion(null);
          }}
          onPointerUp={(event) => {
            if (!start.current || !api) return;
            const rect = bounds(start.current, position(event));
            start.current = null;
            setRegion(null);
            const box = event.currentTarget.getBoundingClientRect();
            const point = viewportCoordsToSceneCoords(
              { clientX: box.left + rect.x, clientY: box.top + rect.y },
              api.getAppState(),
            );
            const zoom = api.getAppState().zoom.value;
            onRegion({
              x: point.x,
              y: point.y,
              width: rect.width / zoom,
              height: rect.height / zoom,
            });
          }}
        >
          <span className="region-instruction">
            {regionHint} · Esc to cancel
          </span>
          {region && (
            <div
              className="region-outline"
              style={{
                left: region.x,
                top: region.y,
                width: region.width,
                height: region.height,
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
export function selectElement(api: ExcalidrawImperativeAPI | null, id: string) {
  api?.setActiveTool({ type: "selection" });
  api?.updateScene({
    appState: { selectedElementIds: { [id]: true } },
    captureUpdate: CaptureUpdateAction.NEVER,
  });
}

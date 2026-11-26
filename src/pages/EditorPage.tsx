import { useEffect, useRef, useState } from "react";
import {
  CaptureUpdateAction,
  exportToBlob,
  exportToSvg,
  serializeAsJSON,
} from "@excalidraw/excalidraw";
import type {
  BinaryFileData,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import {
  ChevronRight,
  CloudCheck,
  Download,
  Focus,
  ImagePlus,
  Magnet,
  MessageSquarePlus,
  Moon,
  PanelRight,
  Redo2,
  ScanText,
  Search,
  Settings2,
  Sparkles,
  Sun,
  Undo2,
} from "lucide-react";
import { Brand, ModeBadge } from "../components/Brand";
import { CommandPalette, type CommandItem } from "../components/CommandPalette";
import { DraftDialog } from "../components/DraftDialog";
import { IconButton } from "../components/IconButton";
import { Inspector, type InspectorTab } from "../components/Inspector";
import { Modal } from "../components/Modal";
import { Settings, type Theme } from "../components/Settings";
import { CanvasStage, selectElement } from "../canvas/CanvasStage";
import {
  addElements,
  insertionPoint,
  makeReference,
  type Skeleton,
} from "../canvas/elements";
import {
  compressImage,
  cropImage,
  readImage,
  type Region,
} from "../canvas/images";
import type { WorkspaceRepository } from "../data/repository";
import type { ContextProvider, Mode } from "../data/services";
import { useAutosave } from "../hooks/useAutosave";
import {
  analyze,
  generateTasks,
  rankSources,
  taskMarkdown,
  type DraftFormat,
  type Match,
} from "../shared/intelligence";
import {
  bytes,
  limits,
  type Annotation,
  type Scene,
  type Source,
  type Workspace,
} from "../shared/model";
import { download, downloadJSON } from "../shared/download";

type ExportFormat =
  | "Trace JSON"
  | "Excalidraw scene"
  | "PNG image"
  | "SVG image"
  | "Selected PNG";
type AnnotationDraft = {
  region?: Region;
  targetId?: string;
  note: string;
  extractedText: string;
  existing?: Annotation;
};
interface Props {
  initial: Workspace;
  repository: WorkspaceRepository;
  context: ContextProvider;
  mode: Mode;
  theme: Theme;
  toggle: () => void;
  close: () => void;
  boards: CommandItem[];
}
export function EditorPage({
  initial,
  repository,
  context,
  mode,
  theme,
  toggle,
  close,
  boards,
}: Props) {
  const { workspace, current, status, error, save, update } = useAutosave(
    initial,
    repository,
    mode !== "Atlassian",
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [tab, setTab] = useState<InspectorTab>("Annotations");
  const [inspector, setInspector] = useState(true);
  const [regionMode, setRegionMode] = useState<"annotation" | "crop" | null>(
    null,
  );
  const [annotation, setAnnotation] = useState<AnnotationDraft | null>(null);
  const [ocr, setOcr] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [authorizedSources, setAuthorizedSources] = useState<
    Record<string, Source>
  >({});
  const [busy, setBusy] = useState(false);
  const [explanation, setExplanation] = useState<ReturnType<
    typeof analyze
  > | null>(null);
  const [draftFormat, setDraftFormat] = useState<DraftFormat>("Auto");
  const [draftIndex, setDraftIndex] = useState<number | null>(null);
  const [settings, setSettings] = useState(false);
  const [palette, setPalette] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [name, setName] = useState(initial.name);
  const api = useRef<ExcalidrawImperativeAPI | null>(null);
  const messageTimer = useRef<number>(undefined);
  const inFlight = useRef(
    new Map<string, Promise<{ sources: Source[]; warnings: string[] }>>(),
  );
  const lastSearch = useRef(0);
  const notify = (text: string) => {
    setMessage(text);
    window.clearTimeout(messageTimer.current);
    messageTimer.current = window.setTimeout(() => setMessage(""), 6500);
  };
  const report = (problem: unknown) =>
    notify(
      problem instanceof Error ? problem.message : "Something went wrong.",
    );
  const scene = workspace.scene;
  const storedDrafts = scene.drafts ?? [];
  const drafts = storedDrafts.map(({ draft }) => ({
    ...draft,
    evidence: draft.evidence.map(
      (source) => authorizedSources[source.id] ?? source,
    ),
  }));
  const visibleIds = new Set(
    scene.elements
      .filter((element) => !element.isDeleted)
      .map((element) => element.id),
  );
  const liveAnnotations = scene.annotations.filter((item) =>
    visibleIds.has(item.elementId),
  );
  const linked = [
    ...new Map(
      Object.entries(scene.references)
        .filter(([id]) => visibleIds.has(id))
        .map(([, entry]) => [
          entry.source.id,
          authorizedSources[entry.source.id] ?? entry.source,
        ]),
    ).values(),
  ];
  const selectedImage = scene.elements.find(
    (element) =>
      selected.includes(element.id) &&
      element.type === "image" &&
      !element.isDeleted,
  );
  const relatedToSelection = liveAnnotations.find((item) =>
    selected.includes(item.elementId),
  );
  const setScene = (change: (before: Scene) => Scene) =>
    update((before) => ({ ...before, scene: change(before.scene) }));
  const goBack = async () => {
    if (await save()) close();
  };
  const setCurrentTab = (next: InspectorTab) => {
    setTab(next);
    setInspector(true);
  };

  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        event.stopImmediatePropagation();
        setPalette((value) => !value);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        event.stopImmediatePropagation();
        void save();
      }
      if (event.key === "Escape") setRegionMode(null);
    };
    window.addEventListener("keydown", keys, true);
    return () => {
      window.removeEventListener("keydown", keys, true);
      window.clearTimeout(messageTimer.current);
    };
  }, [save]);

  useEffect(() => {
    if (mode !== "Atlassian") return;
    const active = [
      ...Object.values(initial.scene.references).map((ref) => ref.source),
      ...(initial.scene.drafts ?? []).flatMap(({ draft }) => draft.evidence),
    ];
    if (!active.length) return;
    let cancelled = false;
    const unique = [
      ...new Map(active.map((source) => [source.id, source])).values(),
    ].slice(0, 5);
    void Promise.allSettled(
      unique.map((source) => context.refresh(source.product, source.id)),
    ).then((results) => {
      if (cancelled) return;
      setAuthorizedSources(
        Object.fromEntries(
          results.flatMap((result) =>
            result.status === "fulfilled"
              ? [[result.value.id, result.value]]
              : [],
          ),
        ),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [context, initial, mode]);

  async function insertImage(file: File, at?: { x: number; y: number }) {
    try {
      const image = await compressImage(file);
      const editor = api.current;
      if (!editor) return;
      if (Object.keys(current.current.scene.files).length >= limits.images)
        throw new Error("This board reached its image limit.");
      const id = crypto.randomUUID();
      const fileId = crypto.randomUUID();
      const fileData = {
        id: fileId,
        created: Date.now(),
        mimeType: "image/webp" as const,
        dataURL: image.dataURL,
      };
      const width = Math.min(image.width, 500);
      const height = (image.height * width) / image.width;
      editor.addFiles([fileData as BinaryFileData]);
      const elements = addElements(editor, [
        {
          id,
          type: "image",
          fileId: fileData.id as BinaryFileData["id"],
          status: "saved",
          ...(at ?? insertionPoint(editor, width, height)),
          width,
          height,
        },
      ]);
      setScene((before) => ({
        ...before,
        elements,
        files: { ...before.files, [fileId]: fileData },
      }));
      selectElement(editor, id);
      editor.scrollToContent(id, { animate: false });
    } catch (problem) {
      report(problem);
    }
  }
  function sticky() {
    const editor = api.current;
    if (!editor) return;
    const id = crypto.randomUUID();
    setScene((before) => ({
      ...before,
      elements: addElements(editor, [
        {
          id,
          type: "rectangle",
          ...insertionPoint(editor, 220, 130),
          width: 220,
          height: 130,
          backgroundColor: "#fff2bf",
          strokeColor: "#dfbd69",
          fillStyle: "solid",
          roughness: 0,
          strokeWidth: 1,
          roundness: { type: 3 },
          label: {
            text: "Write a note",
            fontSize: 17,
            strokeColor: "#71532a",
            fontFamily: 2,
          },
        },
      ]),
    }));
    selectElement(editor, id);
  }
  function openAnnotation(item?: Annotation) {
    if (item) {
      setAnnotation({
        existing: item,
        note: item.note,
        extractedText: item.extractedText,
        targetId: item.targetId,
        region: item.region,
      });
      return;
    }
    const target = scene.elements.find(
      (element) => selected.includes(element.id) && !element.isDeleted,
    );
    if (target && target.type !== "image") {
      setAnnotation({ targetId: target.id, note: "", extractedText: "" });
      return;
    }
    setRegionMode("annotation");
  }
  function regionSelected(region: Region) {
    setRegionMode(null);
    const image =
      selectedImage ??
      [...scene.elements]
        .reverse()
        .find(
          (item) =>
            item.type === "image" &&
            !item.isDeleted &&
            region.x <= item.x + item.width &&
            region.x + region.width >= item.x &&
            region.y <= item.y + item.height &&
            region.y + region.height >= item.y,
        );
    if (regionMode === "crop") {
      void (async () => {
        try {
          if (
            !image ||
            typeof image.fileId !== "string" ||
            !scene.files[image.fileId]
          )
            throw new Error("Select an image before cropping.");
          if (region.width < 3 || region.height < 3)
            throw new Error("Drag to select a crop region.");
          const blob = await cropImage(
            scene.files[image.fileId],
            region,
            image,
          );
          await insertImage(
            new File([blob], "crop.png", { type: "image/png" }),
            { x: image.x + image.width + 36, y: image.y },
          );
          notify("Cropped image added beside the original.");
        } catch (problem) {
          report(problem);
        }
      })();
    } else
      setAnnotation({
        region,
        targetId: image?.id,
        note: "",
        extractedText: "",
      });
  }
  function saveAnnotation() {
    const editor = api.current;
    if (!editor || !annotation?.note.trim()) return;
    if (annotation.existing) {
      const existing = annotation.existing;
      setScene((before) => ({
        ...before,
        annotations: before.annotations.map((item) =>
          item.id === existing.id
            ? {
                ...item,
                note: annotation.note.trim(),
                extractedText: annotation.extractedText,
              }
            : item,
        ),
      }));
      setAnnotation(null);
      return;
    }
    const elementId = crypto.randomUUID();
    const number =
      Math.max(0, ...scene.annotations.map((item) => item.number)) + 1;
    const target = scene.elements.find(
      (item) => item.id === annotation.targetId,
    );
    const mark =
      annotation.region ??
      (target
        ? {
            x: target.x + target.width - 10,
            y: target.y - 13,
            width: 0,
            height: 0,
          }
        : null) ??
      insertionPoint(editor, 30, 30);
    const items: Skeleton[] = [
      {
        id: elementId,
        type: "ellipse",
        x: mark.x - 12,
        y: mark.y - 12,
        width: 30,
        height: 30,
        backgroundColor: "#7655d5",
        strokeColor: "#fff",
        fillStyle: "solid",
        roughness: 0,
        strokeWidth: 1,
        label: {
          text: String(number),
          fontSize: 15,
          strokeColor: "#fff",
          fontFamily: 2,
        },
      },
    ];
    if (
      annotation.region &&
      annotation.region.width > 4 &&
      annotation.region.height > 4
    )
      items.unshift({
        type: "rectangle",
        ...annotation.region,
        strokeColor: "#815cef",
        strokeStyle: "dashed",
        strokeWidth: 2,
        roughness: 0,
        roundness: { type: 3 },
      });
    setScene((before) => ({
      ...before,
      elements: addElements(editor, items),
      annotations: [
        ...before.annotations,
        {
          id: crypto.randomUUID(),
          elementId,
          number,
          targetId: annotation.targetId,
          region: annotation.region,
          note: annotation.note.trim(),
          extractedText: annotation.extractedText,
          resolved: false,
        },
      ],
    }));
    selectElement(editor, elementId);
    setCurrentTab("Annotations");
    setAnnotation(null);
  }
  async function runOCR() {
    if (!annotation) return;
    const target = scene.elements.find(
      (item) => item.id === annotation.targetId,
    );
    if (
      !target ||
      typeof target.fileId !== "string" ||
      !scene.files[target.fileId]
    )
      return;
    if (Number(target.angle) !== 0) {
      notify("Reset image rotation before reading text.");
      return;
    }
    setOcr(0);
    try {
      const image = await cropImage(
        scene.files[target.fileId],
        annotation.region && annotation.region.width > 3
          ? annotation.region
          : target,
        target,
      );
      const extractedText = await readImage(image, setOcr);
      setAnnotation((value) => (value ? { ...value, extractedText } : value));
      if (!extractedText)
        notify("No readable text found in the selected region.");
    } catch (problem) {
      report(problem);
    } finally {
      setOcr(null);
    }
  }
  async function retrieve(text: string) {
    const key = text.trim().slice(0, 1200);
    if (!key) return { sources: [], warnings: [] };
    const pending = inFlight.current.get(key);
    if (pending) return pending;
    const request = context.search(key);
    inFlight.current.set(key, request);
    try {
      return await request;
    } finally {
      inFlight.current.delete(key);
    }
  }
  async function searchContext(text: string) {
    setCurrentTab("Context");
    if (!text.trim()) {
      notify("Select labeled shapes or an annotation, or enter a search term.");
      return;
    }
    const ticket = ++lastSearch.current;
    setBusy(true);
    setWarnings([]);
    setMatches([]);
    try {
      const response = await retrieve(text);
      if (lastSearch.current !== ticket) return;
      setWarnings(response.warnings);
      setMatches(rankSources(text, response.sources));
    } catch (problem) {
      report(problem);
    } finally {
      if (lastSearch.current === ticket) setBusy(false);
    }
  }
  function magnet() {
    const result = analyze(current.current.scene, selected);
    setQuery(result.text.split("\n")[0]?.slice(0, 180) ?? "");
    void searchContext(result.text);
  }
  async function makeDrafts() {
    const result = analyze(current.current.scene, selected);
    if (!result.text.trim()) {
      notify("Select a labeled shape, sticky note or annotation first.");
      return;
    }
    setBusy(true);
    setCurrentTab("Tasks");
    try {
      let sources: Source[] = [];
      try {
        sources = (await retrieve(result.text)).sources;
      } catch {
        notify("Sources are unavailable. Drafts will use canvas evidence.");
      }
      const next = generateTasks(result, sources, draftFormat).map((draft) => ({
        id: crypto.randomUUID(),
        draft,
      }));
      setScene((before) => ({ ...before, drafts: next }));
    } finally {
      setBusy(false);
    }
  }
  function addSource(source: Source, link: boolean, targets = selected) {
    const editor = api.current;
    if (!editor) return;
    const existing = Object.entries(current.current.scene.references).find(
      ([id, ref]) =>
        ref.source.id === source.id &&
        editor.getSceneElements().some((element) => element.id === id),
    );
    const targetElements = editor
      .getSceneElements()
      .filter((item) => targets.includes(item.id));
    const target = link ? targetElements[0] : undefined;
    const position = target
      ? { x: target.x + target.width + 38, y: target.y + 12 }
      : insertionPoint(editor, 300, 77);
    const id = existing?.[0] ?? crypto.randomUUID();
    const items = existing
      ? []
      : makeReference(
          id,
          position.x,
          position.y,
          mode === "Atlassian" ? { ...source, title: source.id } : source,
        );
    const targetIds = link
      ? [
          ...new Set([
            ...(existing?.[1].targetIds ?? []),
            ...targets.filter((targetId) => targetId !== id),
          ]),
        ]
      : (existing?.[1].targetIds ?? []);
    if (target && !existing)
      items.push({
        type: "arrow",
        x: target.x + target.width + 5,
        y: target.y + target.height / 2,
        width: 30,
        height: 0,
        points: [
          [0, 0],
          [30, 0],
        ],
        strokeColor: "#8a70cb",
        roughness: 0,
        end: { id },
      });
    setScene((before) => ({
      ...before,
      elements: items.length ? addElements(editor, items) : before.elements,
      annotations:
        source.product === "Jira" && link
          ? before.annotations.map((item) =>
              targetIds.includes(item.elementId) ||
              targetIds.includes(item.targetId ?? "")
                ? { ...item, linkedIssue: source.id }
                : item,
            )
          : before.annotations,
      references: {
        ...before.references,
        [id]: { source, targetIds, provenance: "manual" },
      },
    }));
    notify(
      link ? "Source linked to selection." : "Reference added to the canvas.",
    );
  }
  async function graphLinks(source: Source) {
    if (!context.graphLinks) return;
    setBusy(true);
    try {
      const links = await context.graphLinks(source.id);
      if (!links.length) {
        notify("Teamwork Graph returned no accessible linked pages.");
        return;
      }
      setMatches((before) => [
        ...links.map((item) => ({
          source: item,
          why: "Confirmed Teamwork Graph link from " + source.title,
          duplicate: false,
        })),
        ...before.filter(
          (item) => !links.some((link) => link.id === item.source.id),
        ),
      ]);
    } catch (problem) {
      report(problem);
    } finally {
      setBusy(false);
    }
  }
  function explain() {
    setExplanation(analyze(current.current.scene, selected));
  }
  function serializeSelection() {
    const value = current.current.scene;
    const result = analyze(value, selected);
    const ids = new Set(result.ids);
    downloadJSON(
      {
        elements: value.elements.filter(
          (item) =>
            !item.isDeleted &&
            (ids.has(item.id) ||
              ids.has(String(item.containerId)) ||
              result.edges.some(
                ({ from, to }) =>
                  String(JSON.stringify(item.startBinding)).includes(from) &&
                  String(JSON.stringify(item.endBinding)).includes(to),
              )),
        ),
        annotations: result.annotations,
        selectedIds: [...ids],
      },
      "trace-selection.json",
    );
  }
  function removeSource(source: Source) {
    const editor = api.current;
    if (!editor) return;
    const ids = Object.entries(scene.references)
      .filter(([, item]) => item.source.id === source.id)
      .map(([id]) => id);
    const groups = new Set(
      editor
        .getSceneElements()
        .filter((item) => ids.includes(item.id))
        .flatMap((item) => item.groupIds),
    );
    const elements = editor
      .getSceneElementsIncludingDeleted()
      .filter(
        (item) =>
          !ids.includes(item.id) &&
          !item.groupIds.some((id) => groups.has(id)) &&
          !(
            item.type === "arrow" &&
            item.endBinding &&
            ids.includes(item.endBinding.elementId)
          ),
      );
    editor.updateScene({
      elements,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    setScene((before) => ({
      ...before,
      elements: elements as unknown as Scene["elements"],
      references: Object.fromEntries(
        Object.entries(before.references).filter(([id]) => !ids.includes(id)),
      ),
      annotations: before.annotations.map((item) =>
        item.linkedIssue === source.id
          ? { ...item, linkedIssue: undefined }
          : item,
      ),
    }));
  }
  async function refresh(source: Source) {
    try {
      const fresh = await context.refresh(source.product, source.id);
      if (mode === "Atlassian")
        setAuthorizedSources((before) => ({ ...before, [fresh.id]: fresh }));
      else
        setScene((before) => ({
          ...before,
          references: Object.fromEntries(
            Object.entries(before.references).map(([id, ref]) => [
              id,
              ref.source.id === source.id ? { ...ref, source: fresh } : ref,
            ]),
          ),
        }));
      notify("Source refreshed.");
    } catch (problem) {
      report(problem);
    }
  }
  async function exportBoard(format: ExportFormat) {
    setExportOpen(false);
    try {
      const board = current.current;
      const filename = board.name
        .replace(/[^\p{L}\p{N}-]+/gu, "-")
        .toLowerCase();
      if (format === "Trace JSON") {
        downloadJSON(board, filename + ".trace.json");
        return;
      }
      const everything = board.scene.elements as unknown as ExcalidrawElement[];
      const elements = everything.filter(
        (element) =>
          !element.isDeleted &&
          (format !== "Selected PNG" ||
            selected.includes(element.id) ||
            (element.type === "text" &&
              element.containerId &&
              selected.includes(element.containerId))),
      );
      const files = board.scene.files as unknown as BinaryFiles;
      if (format === "Excalidraw scene") {
        download(
          new Blob([serializeAsJSON(elements, {}, files, "local")], {
            type: "application/json",
          }),
          filename + ".excalidraw",
        );
        return;
      }
      if (!elements.length)
        throw new Error("Draw or select something to export.");
      const options = {
        elements,
        files,
        appState: { exportBackground: true, viewBackgroundColor: "#fbfaff" },
      };
      if (format === "SVG image") {
        const svg = await exportToSvg(options);
        download(
          new Blob([svg.outerHTML], { type: "image/svg+xml" }),
          filename + ".svg",
        );
      } else download(await exportToBlob(options), filename + ".png");
    } catch (problem) {
      report(problem);
    }
  }
  function jump(id: string) {
    setSelected([id]);
    selectElement(api.current, id);
    api.current?.scrollToContent(id, { animate: false });
  }
  const commands: CommandItem[] = [
    { label: "Find context", run: magnet },
    {
      label: "Search Jira and Confluence",
      run: () => setCurrentTab("Context"),
    },
    { label: "Explain selection", run: explain },
    { label: "Export selection for Trace Companion", run: serializeSelection },
    { label: "Generate task drafts", run: () => void makeDrafts() },
    { label: "Create annotation", run: () => openAnnotation() },
    {
      label: "Insert image",
      run: () =>
        document
          .querySelector<HTMLButtonElement>('[aria-label="Upload image"]')
          ?.click(),
    },
    { label: "Switch theme", run: toggle },
    { label: "Export workspace", run: () => setExportOpen(true) },
    ...boards.map((item) => ({
      ...item,
      run: () =>
        void save().then((saved) => {
          if (saved) item.run();
        }),
    })),
    ...scene.elements
      .filter(
        (item) =>
          !item.isDeleted &&
          item.type === "text" &&
          typeof item.text === "string",
      )
      .map((item) => ({
        label: String(item.text),
        detail: "Canvas element",
        run: () => jump(item.id),
      })),
  ];
  const activeDraft = draftIndex !== null ? drafts[draftIndex] : undefined;
  const canOCR = scene.elements.some(
    (item) =>
      item.id === annotation?.targetId &&
      typeof item.fileId === "string" &&
      scene.files[item.fileId],
  );
  return (
    <div className="editor">
      <header className="editor-header">
        <Brand onClick={() => void goBack()} />
        <div className="editor-breadcrumb">
          <button onClick={() => void goBack()}>Workspaces</button>
          <ChevronRight size={15} />
          <input
            aria-label="Canvas name"
            value={name}
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => {
              const next = name.trim() || workspace.name;
              setName(next);
              if (next !== workspace.name)
                update((before) => ({ ...before, name: next }));
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
        </div>
        <div className="header-end">
          <ModeBadge mode={mode} />
          <button
            className={
              "save-status " + (status === "Save failed" ? "failed" : "")
            }
            title="Save workspace"
            aria-label="Save workspace"
            onClick={() => void save()}
          >
            <CloudCheck size={15} />
            <span role="status">{status}</span>
          </button>
          <IconButton
            label="Command palette (Ctrl+K)"
            onClick={() => setPalette(true)}
          >
            <Search size={17} />
          </IconButton>
          <IconButton label="Switch theme" onClick={toggle}>
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </IconButton>
          <IconButton label="Settings" onClick={() => setSettings(true)}>
            <Settings2 size={17} />
          </IconButton>
          <button
            className="button export-button"
            onClick={() => setExportOpen(true)}
          >
            <Download size={15} /> <span>Export</span>
          </button>
        </div>
      </header>
      <div className="editor-subheader">
        <div className="canvas-label">
          <Focus size={16} />
          <strong>Canvas</strong>
        </div>
        <div className="editor-controls">
          <IconButton
            label="Undo"
            onClick={() =>
              document
                .querySelector<HTMLButtonElement>(
                  '.excalidraw [data-testid="button-undo"]',
                )
                ?.click()
            }
          >
            <Undo2 size={16} />
          </IconButton>
          <IconButton
            label="Redo"
            onClick={() =>
              document
                .querySelector<HTMLButtonElement>(
                  '.excalidraw [data-testid="button-redo"]',
                )
                ?.click()
            }
          >
            <Redo2 size={16} />
          </IconButton>
          <span className="toolbar-separator" />
          <button
            className="button compact"
            onClick={() => openAnnotation(relatedToSelection)}
          >
            <MessageSquarePlus size={15} /> <span>Annotate</span>
          </button>
          <button
            className="button compact violet"
            onClick={magnet}
            disabled={busy}
          >
            <Magnet size={15} /> <span>Find context</span>
          </button>
          {selected.length > 0 && (
            <button
              className="button compact selection-extra"
              onClick={() => void makeDrafts()}
              disabled={busy}
            >
              <Sparkles size={15} /> Draft tasks
            </button>
          )}
          {selected.length > 0 && (
            <button
              className="button compact selection-extra"
              onClick={explain}
            >
              Explain
            </button>
          )}
          {selectedImage && (
            <button
              className="button compact selection-extra"
              onClick={() => setRegionMode("crop")}
            >
              <ImagePlus size={15} /> Crop image
            </button>
          )}
          <IconButton
            label="Toggle inspector"
            aria-pressed={inspector}
            onClick={() => setInspector((value) => !value)}
          >
            <PanelRight size={17} />
          </IconButton>
        </div>
      </div>
      {error && (
        <div className="save-error" role="alert">
          {error}
          <button className="button compact" onClick={() => void save()}>
            Retry
          </button>
          <button
            className="button compact"
            onClick={() => void exportBoard("Trace JSON")}
          >
            Export draft
          </button>
        </div>
      )}
      <div className={"editor-body " + (inspector ? "has-inspector" : "")}>
        <CanvasStage
          scene={scene}
          theme={theme}
          setAPI={(editor) => {
            api.current = editor;
          }}
          onSelection={setSelected}
          onScene={(elements, files) =>
            setScene((before) => ({ ...before, elements, files }))
          }
          onImage={(file) => void insertImage(file)}
          onRegion={regionSelected}
          onSticky={sticky}
          regionMode={regionMode !== null}
          regionHint={
            regionMode === "crop"
              ? "Drag across the image to crop"
              : "Click to pin or drag to highlight"
          }
        />
        {inspector && (
          <Inspector
            tab={tab}
            setTab={setCurrentTab}
            close={() => setInspector(false)}
            annotations={liveAnnotations}
            selected={selected}
            onAnnotation={(item) => {
              if (selected.includes(item.elementId)) openAnnotation(item);
              else jump(item.elementId);
            }}
            resolve={(item) =>
              setScene((before) => ({
                ...before,
                annotations: before.annotations.map((value) =>
                  value.id === item.id
                    ? { ...value, resolved: !value.resolved }
                    : value,
                ),
              }))
            }
            addAnnotation={() => openAnnotation()}
            findContext={magnet}
            draft={() => void makeDrafts()}
            query={query}
            setQuery={setQuery}
            search={() => void searchContext(query)}
            sources={matches}
            openSource={
              context.openSource
                ? (url) => void context.openSource?.(url).catch(report)
                : undefined
            }
            linked={linked}
            graphLinks={
              context.graphLinks
                ? (source) => void graphLinks(source)
                : undefined
            }
            addSource={addSource}
            refresh={(source) => void refresh(source)}
            remove={removeSource}
            dismiss={(id) =>
              setMatches((values) =>
                values.filter((value) => value.source.id !== id),
              )
            }
            drafts={drafts}
            draftFormat={draftFormat}
            setDraftFormat={setDraftFormat}
            editDraft={setDraftIndex}
            exportDrafts={() =>
              download(
                new Blob([taskMarkdown(drafts)], { type: "text/markdown" }),
                "trace-task-drafts.md",
              )
            }
            busy={busy}
            warnings={warnings}
          />
        )}
      </div>
      {message && (
        <div className="toast" role="status">
          {message}
        </div>
      )}
      {annotation && (
        <Modal
          title={annotation.existing ? "Edit annotation" : "New annotation"}
          onClose={() => {
            if (ocr === null) setAnnotation(null);
          }}
        >
          <form
            className="form"
            onSubmit={(event) => {
              event.preventDefault();
              saveAnnotation();
            }}
          >
            <label>
              Feedback
              <textarea
                autoFocus
                required
                rows={4}
                maxLength={2000}
                placeholder="What should the team know?"
                value={annotation.note}
                onChange={(event) =>
                  setAnnotation({ ...annotation, note: event.target.value })
                }
              />
            </label>
            {canOCR && (
              <button
                type="button"
                className="button"
                onClick={() => void runOCR()}
                disabled={ocr !== null}
              >
                <ScanText size={16} />
                {ocr === null
                  ? "Read screenshot text"
                  : "Reading screenshot · " + Math.round(ocr * 100) + "%"}
              </button>
            )}
            {annotation.extractedText && (
              <label>
                Extracted text
                <textarea
                  rows={4}
                  maxLength={4000}
                  value={annotation.extractedText}
                  onChange={(event) =>
                    setAnnotation({
                      ...annotation,
                      extractedText: event.target.value,
                    })
                  }
                />
              </label>
            )}
            <footer>
              <button
                type="button"
                className="button"
                disabled={ocr !== null}
                onClick={() => setAnnotation(null)}
              >
                Cancel
              </button>
              <button
                className="button primary"
                disabled={ocr !== null || !annotation.note.trim()}
              >
                Save annotation
              </button>
            </footer>
          </form>
        </Modal>
      )}
      {explanation && (
        <Modal title="Selection evidence" onClose={() => setExplanation(null)}>
          <div className="form">
            {explanation.nodes.length > 0 && (
              <ul>
                {explanation.nodes.slice(0, 20).map((node) => (
                  <li key={node.id}>
                    {node.label}
                    {node.dependsOn.length
                      ? " · after " + node.dependsOn.join(", ")
                      : ""}
                  </li>
                ))}
              </ul>
            )}
            {explanation.annotations.map((item) => (
              <p key={item.id}>{item.note}</p>
            ))}
            {!explanation.nodes.length && !explanation.annotations.length && (
              <p>
                Choose a labeled shape, diagram or annotation to see its
                evidence.
              </p>
            )}
            <footer>
              <button className="button" onClick={serializeSelection}>
                Export selection JSON
              </button>
            </footer>
          </div>
        </Modal>
      )}
      {settings && (
        <Settings
          mode={mode}
          theme={theme}
          toggle={toggle}
          usage={bytes(scene)}
          onClose={() => setSettings(false)}
        />
      )}
      {palette && (
        <CommandPalette items={commands} onClose={() => setPalette(false)} />
      )}
      {exportOpen && (
        <Modal title="Export canvas" onClose={() => setExportOpen(false)}>
          <div className="export-options">
            {(
              [
                "Trace JSON",
                "Excalidraw scene",
                "PNG image",
                "SVG image",
                ...(selected.length ? ["Selected PNG"] : []),
              ] as ExportFormat[]
            ).map((format) => (
              <button
                key={format}
                className="button"
                onClick={() => void exportBoard(format)}
              >
                <Download size={16} />
                {format}
              </button>
            ))}
          </div>
        </Modal>
      )}
      {activeDraft && draftIndex !== null && (
        <DraftDialog
          key={draftIndex}
          draft={activeDraft}
          mode={mode}
          context={context}
          requestId={storedDrafts[draftIndex].id}
          update={(item) =>
            setScene((before) => ({
              ...before,
              drafts: before.drafts?.map((entry, index) =>
                index === draftIndex ? { ...entry, draft: item } : entry,
              ),
            }))
          }
          origin={() => {
            if (activeDraft.elementIds[0]) jump(activeDraft.elementIds[0]);
            setDraftIndex(null);
          }}
          onClose={() => setDraftIndex(null)}
          created={(source) => {
            addSource(source, true, activeDraft.elementIds);
            setScene((before) => ({
              ...before,
              drafts: before.drafts?.filter((_, index) => index !== draftIndex),
            }));
            setDraftIndex(null);
            setCurrentTab("Context");
            notify(source.id + " created and linked.");
          }}
        />
      )}
    </div>
  );
}

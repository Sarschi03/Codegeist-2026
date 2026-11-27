import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { EditorBoundary } from "./components/EditorBoundary";
import { Route } from "lucide-react";
import { loadServices } from "./data/services";
import { db } from "./data/repository";
import {
  validateWorkspace,
  limits,
  emptyScene,
  type Template,
  type Workspace,
  type WorkspaceSummary,
} from "./shared/model";
import { WorkspacePage, type EditAction } from "./pages/WorkspacePage";
import { CommandPalette } from "./components/CommandPalette";
import { Settings, type Theme } from "./components/Settings";

const Editor = lazy(async () => ({
  default: (await import("./pages/EditorPage")).EditorPage,
}));
type Services = Awaited<ReturnType<typeof loadServices>>;
function copyDrafts(scene: Workspace["scene"]): Workspace["scene"] {
  return {
    ...scene,
    drafts: scene.drafts
      ?.filter((entry) => !entry.attempted)
      .map(({ draft }) => ({ id: crypto.randomUUID(), draft })),
  };
}
const loading = (
  <div className="loading">
    <Route size={24} />
    <span>Opening Trace…</span>
  </div>
);

export function App() {
  const [services, setServices] = useState<Services | null>(null);
  const [boards, setBoards] = useState<WorkspaceSummary[]>([]);
  const [active, setActive] = useState<Workspace | null>(null);
  const [theme, setTheme] = useState<Theme>(() =>
    localStorage.getItem("trace-theme") === "dark" ? "dark" : "light",
  );
  const [settings, setSettings] = useState(false);
  const [palette, setPalette] = useState(false);
  const [recovery, setRecovery] = useState<Workspace | null>(null);
  const [error, setError] = useState("");
  const [startupError, setStartupError] = useState("");
  const attempt = useRef(0);
  const toggle = () =>
    setTheme((value) => (value === "dark" ? "light" : "dark"));
  const notify = (problem: unknown) =>
    setError(
      problem instanceof Error ? problem.message : "Something went wrong.",
    );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("trace-theme", theme);
  }, [theme]);
  const init = async () => {
    try {
      setStartupError("");
      const next = await loadServices();
      const list = await next.repository.list();
      if (
        next.mode !== "Atlassian" &&
        !list.length &&
        !localStorage.getItem("trace-seeded-" + next.mode)
      ) {
        const { newWorkspace } = await import("./data/seed");
        const sample = await next.repository.save(
          newWorkspace("Checkout redesign", "Design review", true),
          null,
        );
        localStorage.setItem("trace-seeded-" + next.mode, "1");
        setActive(sample);
        setBoards(await next.repository.list());
      } else {
        setBoards(list);
        const target = new URLSearchParams(location.hash.slice(1)).get("board");
        if (target) {
          const workspace = await next.repository.get(target);
          if (workspace) {
            setActive(workspace);
            if (next.mode !== "Atlassian") {
              const draft = await db.recovery.get(target);
              if (draft) setRecovery(draft);
            }
          }
        }
      }
      setServices(next);
    } catch (problem) {
      setStartupError(
        problem instanceof Error ? problem.message : "Trace could not start.",
      );
    }
  };
  useEffect(() => {
    void init();
  }, []);
  useEffect(() => {
    if (!services) return;
    const url = active
      ? "#board=" + active.id
      : location.pathname + location.search;
    history.replaceState(null, "", url);
  }, [active, services]);
  useEffect(() => {
    if (active) return;
    const keyboard = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette((value) => !value);
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [active]);
  async function reload() {
    if (services) setBoards(await services.repository.list());
  }
  async function open(id: string) {
    if (!services) return;
    const ticket = ++attempt.current;
    try {
      setError("");
      const stored = await services.repository.get(id);
      if (!stored) throw new Error("That workspace no longer exists.");
      const backup =
        services.mode === "Atlassian" ? undefined : await db.recovery.get(id);
      if (ticket !== attempt.current) return;
      setRecovery(backup ?? null);
      setActive(stored);
    } catch (problem) {
      notify(problem);
    }
  }
  async function create(name: string, template: Template) {
    if (!services) return;
    try {
      setError("");
      const { newWorkspace } = await import("./data/seed");
      const saved = await services.repository.save(
        newWorkspace(name, template),
        null,
      );
      await reload();
      setActive(saved);
    } catch (problem) {
      notify(problem);
      throw problem;
    }
  }
  async function edit(id: string, action: EditAction, name?: string) {
    if (!services) return;
    try {
      setError("");
      const workspace = await services.repository.get(id);
      if (!workspace) throw new Error("That workspace no longer exists.");
      if (action === "delete") {
        await services.repository.remove(id, workspace.revision);
        if (services.mode !== "Atlassian") await db.recovery.delete(id);
      } else if (action === "duplicate") {
        await services.repository.save(
          {
            ...workspace,
            scene: copyDrafts(workspace.scene),
            name: workspace.name.slice(0, 92) + " (copy)",
            id: crypto.randomUUID(),
            createdAt: Date.now(),
            favorite: false,
            revision: 0,
          },
          null,
        );
      } else {
        await services.repository.save(
          {
            ...workspace,
            name: name || workspace.name,
            favorite:
              action === "favorite" ? !workspace.favorite : workspace.favorite,
          },
          workspace.revision,
        );
      }
      await reload();
    } catch (problem) {
      notify(problem);
      if (action === "rename" || action === "delete") throw problem;
    }
  }
  async function importFile(file: File) {
    if (!services) return;
    try {
      setError("");
      if (file.size > limits.workspaceBytes + limits.sceneBytes + 100_000)
        throw new Error("This file exceeds the workspace size limit.");
      const raw = JSON.parse(await file.text());
      const initial =
        raw?.type === "excalidraw"
          ? {
              ...(await import("./data/seed")).newWorkspace(
                file.name.replace(/\.excalidraw$/i, "").slice(0, 100) ||
                  "Imported canvas",
                "Blank canvas",
              ),
              scene: {
                ...emptyScene(),
                elements: raw.elements,
                files: raw.files ?? {},
              },
            }
          : raw;
      const imported = validateWorkspace(initial);
      const saved = await services.repository.save(
        {
          ...imported,
          scene: copyDrafts(imported.scene),
          id: crypto.randomUUID(),
          revision: 0,
          createdAt: Date.now(),
        },
        null,
      );
      await reload();
      setActive(saved);
    } catch (problem) {
      notify(problem);
    }
  }
  const close = () => {
    ++attempt.current;
    setActive(null);
    setRecovery(null);
    void reload().catch(notify);
  };
  const commands = boards
    .filter((item) => item.id !== active?.id)
    .map((item) => ({
      label: item.name,
      detail: "Workspace",
      run: () => void open(item.id),
    }));
  if (startupError)
    return (
      <div className="loading">
        <Route size={25} />
        <p>{startupError}</p>
        <button className="button" onClick={() => void init()}>
          Retry
        </button>
      </div>
    );
  if (!services) return loading;
  return (
    <>
      {active ? (
        <EditorBoundary key={active.id + "-" + active.revision} close={close}>
          <Suspense fallback={loading}>
            <Editor
              key={active.id + "-" + active.revision}
              initial={active}
              repository={services.repository}
              context={services.context}
              mode={services.mode}
              theme={theme}
              toggle={toggle}
              close={close}
              boards={[
                { label: "Open workspace dashboard", run: close },
                ...commands,
              ]}
            />
          </Suspense>
        </EditorBoundary>
      ) : (
        <WorkspacePage
          boards={boards}
          mode={services.mode}
          open={(id) => void open(id)}
          create={create}
          edit={edit}
          settings={() => setSettings(true)}
          importFile={importFile}
          command={() => setPalette(true)}
        />
      )}
      {settings && (
        <Settings
          mode={services.mode}
          theme={theme}
          toggle={toggle}
          onClose={() => setSettings(false)}
        />
      )}
      {palette && (
        <CommandPalette
          items={[
            ...commands,
            { label: "Switch theme", run: toggle },
            { label: "Open settings", run: () => setSettings(true) },
          ]}
          onClose={() => setPalette(false)}
        />
      )}
      {recovery && (
        <div className="toast recover" role="status">
          <span>An unsaved local draft is available.</span>
          <button
            className="button compact"
            onClick={() => {
              const draft = recovery;
              const conflict = active?.revision !== draft.revision;
              const candidate = conflict
                ? {
                    ...draft,
                    id: crypto.randomUUID(),
                    revision: 0,
                    name: draft.name.slice(0, 86) + " (recovered)",
                    scene: copyDrafts(draft.scene),
                  }
                : draft;
              void services.repository
                .save(candidate, conflict ? null : draft.revision)
                .then((saved) => {
                  setActive(saved);
                  setRecovery(null);
                  return db.recovery.delete(draft.id);
                })
                .catch(notify);
            }}
          >
            {active?.revision === recovery.revision
              ? "Restore draft"
              : "Restore as copy"}
          </button>
          <button
            className="button compact"
            onClick={() => {
              void db.recovery.delete(recovery.id).catch(notify);
              setRecovery(null);
            }}
          >
            Discard draft
          </button>
        </div>
      )}
      {error && (
        <div className="toast" role="alert">
          {error}
          <button className="button compact" onClick={() => setError("")}>
            Dismiss
          </button>
        </div>
      )}
    </>
  );
}

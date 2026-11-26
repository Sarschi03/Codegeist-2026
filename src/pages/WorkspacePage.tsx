import { useRef, useState } from "react";
import {
  ArrowUpRight,
  Bug,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  FilePlus2,
  FolderOpen,
  GitBranch,
  Image,
  LayoutGrid,
  Pencil,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import { Brand, ModeBadge } from "../components/Brand";
import { IconButton } from "../components/IconButton";
import { Modal } from "../components/Modal";
import {
  templateNames,
  type Template,
  type WorkspaceSummary,
} from "../shared/model";
import type { Mode } from "../data/services";
const icons = {
  "Blank canvas": FilePlus2,
  "Bug report": Bug,
  "Feature brainstorming": Sparkles,
  "Architecture diagram": LayoutGrid,
  "Design review": Image,
  "User flow": GitBranch,
};
export type EditAction = "favorite" | "rename" | "duplicate" | "delete";
interface Props {
  boards: WorkspaceSummary[];
  mode: Mode;
  open: (id: string) => void;
  create: (name: string, template: Template) => Promise<void>;
  edit: (id: string, action: EditAction, name?: string) => Promise<void>;
  settings: () => void;
  importFile: (file: File) => Promise<void>;
  command: () => void;
}
export function WorkspacePage({
  boards,
  mode,
  open,
  create,
  edit,
  settings,
  importFile,
  command,
}: Props) {
  const [filter, setFilter] = useState<"all" | "favorites">("all");
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<{
    action: "create" | "rename" | "delete";
    board?: WorkspaceSummary;
  } | null>(null);
  const [name, setName] = useState("");
  const [template, setTemplate] = useState<Template>("Blank canvas");
  const [working, setWorking] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const begin = (next: Template = "Blank canvas") => {
    setName("");
    setTemplate(next);
    setDialog({ action: "create" });
  };
  const shown = boards.filter(
    (board) =>
      (filter === "all" || board.favorite) &&
      (board.name + " " + board.description)
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <div className="dashboard">
      <aside className="dashboard-sidebar">
        <Brand
          onClick={() => {
            setSearch("");
            setFilter("all");
          }}
        />
        <button className="side-search" onClick={command}>
          <Search size={16} /> Search <kbd>Ctrl K</kbd>
        </button>
        <div className="nav-title">Workspace</div>
        <button
          className={"side-link " + (filter === "all" ? "active" : "")}
          onClick={() => setFilter("all")}
        >
          <LayoutGrid size={17} /> All boards
        </button>
        <button
          className={"side-link " + (filter === "favorites" ? "active" : "")}
          onClick={() => setFilter("favorites")}
        >
          <Star size={17} /> Favorites
        </button>
        <button className="side-link" onClick={() => input.current?.click()}>
          <FolderOpen size={17} /> Import workspace
        </button>
        <div className="sidebar-bottom">
          <button className="side-link" onClick={settings}>
            <Settings2 size={17} /> Settings
          </button>
          <ModeBadge mode={mode} />
        </div>
        <input
          type="file"
          ref={input}
          accept=".json,.excalidraw"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importFile(file);
            event.target.value = "";
          }}
        />
      </aside>
      <main className="dashboard-content">
        <header className="dash-breadcrumb">
          <span>Workspace</span>
          <ChevronRight size={14} />
          <strong>{filter === "all" ? "All boards" : "Favorites"}</strong>
        </header>
        <div className="dash-inner">
          <section className="dashboard-hero">
            <div>
              <h1>{filter === "all" ? "Your boards" : "Favorites"}</h1>
              <p>Draw it. Connect it. Ship it.</p>
            </div>
            <button className="button primary" onClick={() => begin()}>
              <Plus size={18} /> New workspace
            </button>
          </section>
          <section aria-label="Workspaces">
            <header className="section-header">
              <h2>
                {filter === "all" ? "Recent workspaces" : "Starred workspaces"}
              </h2>
              <label className="search-input">
                <Search size={16} />
                <input
                  aria-label="Search workspaces"
                  placeholder="Search workspaces"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
            </header>
            <div className="boards">
              {shown.map((board) => {
                const TemplateIcon = icons[board.template];
                return (
                  <article className="board-card" key={board.id}>
                    <button
                      className="workspace-open"
                      onClick={() => open(board.id)}
                      aria-label={"Open " + board.name}
                    >
                      <div
                        className={
                          "board-preview preview-" +
                          templateNames.indexOf(board.template)
                        }
                      >
                        <div className="preview-node first">
                          <TemplateIcon size={22} />
                        </div>
                        <div className="preview-node second" />
                        <div className="preview-node third">
                          <Check size={17} />
                        </div>
                        <div className="preview-line one" />
                        <div className="preview-line two" />
                        <ArrowUpRight size={17} className="open-arrow" />
                      </div>
                      <strong>{board.name}</strong>
                      <span>
                        <Clock3 size={13} />{" "}
                        {new Date(board.updatedAt).toLocaleDateString(
                          undefined,
                          { month: "short", day: "numeric" },
                        )}{" "}
                        · {board.template}
                      </span>
                    </button>
                    <div className="board-actions">
                      <IconButton
                        label={board.favorite ? "Remove favorite" : "Favorite"}
                        className={board.favorite ? "selected" : ""}
                        onClick={() => void edit(board.id, "favorite")}
                      >
                        <Star
                          size={15}
                          fill={board.favorite ? "currentColor" : "none"}
                        />
                      </IconButton>
                      <IconButton
                        label="Rename"
                        onClick={() => {
                          setName(board.name);
                          setDialog({ action: "rename", board });
                        }}
                      >
                        <Pencil size={15} />
                      </IconButton>
                      <IconButton
                        label="Duplicate"
                        onClick={() => void edit(board.id, "duplicate")}
                      >
                        <Copy size={15} />
                      </IconButton>
                      <IconButton
                        label="Delete"
                        onClick={() => setDialog({ action: "delete", board })}
                      >
                        <Trash2 size={15} />
                      </IconButton>
                    </div>
                  </article>
                );
              })}
              {!shown.length && (
                <p className="empty">
                  {search
                    ? "No workspaces match your search."
                    : filter === "favorites"
                      ? "Star a workspace to find it here."
                      : "Create a workspace or start with a template below."}
                </p>
              )}
            </div>
          </section>
          {filter === "all" && (
            <section
              aria-label="Workspace templates"
              className="templates-section"
            >
              <header className="section-header">
                <h2>Start with a template</h2>
              </header>
              <div className="templates">
                {templateNames.map((item) => {
                  const Icon = icons[item];
                  return (
                    <button key={item} onClick={() => begin(item)}>
                      <span>
                        <Icon size={20} />
                      </span>
                      {item}
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </main>
      {dialog && (
        <Modal
          title={
            dialog.action === "create"
              ? "New workspace"
              : dialog.action === "rename"
                ? "Rename workspace"
                : "Delete workspace"
          }
          onClose={() => {
            if (!working) setDialog(null);
          }}
        >
          <form
            className="form"
            onSubmit={async (event) => {
              event.preventDefault();
              setWorking(true);
              try {
                if (dialog.action === "create")
                  await create(name.trim(), template);
                else if (dialog.board)
                  await edit(dialog.board.id, dialog.action, name.trim());
                setDialog(null);
              } catch {
                /* App displays the error. */
              } finally {
                setWorking(false);
              }
            }}
          >
            {dialog.action === "delete" ? (
              <p>
                Permanently delete <strong>{dialog.board?.name}</strong> and its
                canvas?
              </p>
            ) : (
              <label>
                Workspace name
                <input
                  autoFocus
                  required
                  maxLength={100}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={
                    template === "Blank canvas"
                      ? "Untitled workspace"
                      : template
                  }
                />
              </label>
            )}
            {dialog.action === "create" && (
              <label>
                Template
                <select
                  value={template}
                  onChange={(event) =>
                    setTemplate(event.target.value as Template)
                  }
                >
                  {templateNames.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
            )}
            <footer>
              <button
                type="button"
                className="button"
                onClick={() => setDialog(null)}
                disabled={working}
              >
                Cancel
              </button>
              <button
                className={
                  "button " +
                  (dialog.action === "delete" ? "danger" : "primary")
                }
                disabled={
                  working || (dialog.action !== "delete" && !name.trim())
                }
              >
                {dialog.action === "delete"
                  ? "Delete workspace"
                  : "Save workspace"}
              </button>
            </footer>
          </form>
        </Modal>
      )}
    </div>
  );
}

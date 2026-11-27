import { useState } from "react";
import type { ContextProvider, IssueFields, Mode } from "../data/services";
import type { JiraCreation, TaskDraft } from "../shared/model";
import { Modal } from "./Modal";
export function DraftDialog({
  draft,
  update,
  mode,
  context,
  created,
  onClose,
  origin,
  requestId,
  prepare,
  discard,
  screenshotAvailable,
}: {
  draft: TaskDraft;
  update: (draft: TaskDraft) => void;
  mode: Mode;
  context: ContextProvider;
  created: (source: JiraCreation) => void;
  onClose: () => void;
  origin: () => void;
  requestId: string;
  discard?: () => void;
  screenshotAvailable?: boolean;
  prepare: () => Promise<{ workspaceId: string; revision: number }>;
}) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [attach, setAttach] = useState(false);
  const [project, setProject] = useState("");
  const [typeId, setTypeId] = useState("");
  const [types, setTypes] = useState<IssueFields[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (operation: () => Promise<void>) => {
    setError("");
    setBusy(true);
    try {
      await operation();
    } catch (problem) {
      setError(
        problem instanceof Error ? problem.message : "Jira request failed.",
      );
    } finally {
      setBusy(false);
    }
  };
  const required = types.find((item) => item.id === typeId)?.required ?? [];
  async function selectType(id: string) {
    setTypeId("");
    setConfirm(false);
    if (context.issueFields) {
      const fields = await context.issueFields(project, id);
      setTypes((previous) =>
        previous.map((item) =>
          item.id === id ? { ...item, required: fields } : item,
        ),
      );
    }
    setTypeId(id);
  }
  return (
    <Modal
      title="Review issue draft"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="form">
        <p className="source-product">
          {draft.issueType} draft · Suggested priority {draft.priority}
        </p>
        <label>
          Summary
          <input
            disabled={busy}
            value={draft.title}
            maxLength={120}
            onChange={(event) => {
              setConfirm(false);
              update({ ...draft, title: event.target.value });
            }}
          />
        </label>
        <label>
          Description
          <textarea
            disabled={busy}
            rows={5}
            value={draft.description}
            maxLength={8000}
            onChange={(event) => {
              setConfirm(false);
              update({ ...draft, description: event.target.value });
            }}
          />
        </label>
        <label>
          Acceptance criteria
          <textarea
            disabled={busy}
            rows={3}
            value={draft.criteria}
            maxLength={2500}
            onChange={(event) => {
              setConfirm(false);
              update({ ...draft, criteria: event.target.value });
            }}
          />
        </label>
        <label>
          Information to confirm
          <textarea
            disabled={busy}
            rows={2}
            value={draft.missing}
            maxLength={1500}
            onChange={(event) => {
              setConfirm(false);
              update({ ...draft, missing: event.target.value });
            }}
          />
        </label>
        <div className="draft-evidence">
          <strong>Source evidence</strong>
          <button className="button compact" onClick={origin}>
            Show canvas origin
          </button>
          {draft.evidence.map((source) =>
            source.url ? (
              <a
                key={source.id}
                href={source.url}
                onClick={
                  context.openSource
                    ? (event) => {
                        event.preventDefault();
                        if (source.url)
                          void run(async () => {
                            await context.openSource?.(source.url!);
                          });
                      }
                    : undefined
                }
                target="_blank"
                rel="noreferrer"
              >
                {source.title}
              </a>
            ) : (
              <span key={source.id}>
                {source.title} · {source.id}
              </span>
            ),
          )}
        </div>
        {mode === "Atlassian" && (
          <>
            <div className="project-fields">
              <label>
                Jira project key
                <input
                  disabled={busy}
                  value={project}
                  onChange={(event) => {
                    setProject(event.target.value.trim().toUpperCase());
                    setTypes([]);
                    setTypeId("");
                    setConfirm(false);
                  }}
                />
              </label>
              <button
                className="button"
                disabled={busy || !project.length}
                onClick={() =>
                  void run(async () => {
                    const list = await context.issueTypes(project);
                    setTypes(list);
                    setConfirm(false);
                    if (!list.length)
                      throw new Error(
                        "No supported issue types were found for that Jira project.",
                      );
                    await selectType(
                      list.find((type) => type.name === draft.issueType)?.id ??
                        list[0]?.id ??
                        "",
                    );
                  })
                }
              >
                Load issue types
              </button>
            </div>
            {types.length > 0 && (
              <label>
                Issue type
                <select
                  disabled={busy}
                  value={typeId}
                  onChange={(event) => {
                    const id = event.target.value;
                    void run(() => selectType(id));
                  }}
                >
                  {types.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {required.length > 0 && (
              <p className="warning">
                This issue type requires fields Trace cannot fill:{" "}
                {required.join(", ")}. Create it in Jira or choose another type.
              </p>
            )}
          </>
        )}
        {mode === "Atlassian" && screenshotAvailable && (
          <label>
            <span>
              <input
                type="checkbox"
                disabled={busy}
                checked={attach}
                onChange={(event) => {
                  setAttach(event.target.checked);
                  setConfirm(false);
                }}
                style={{ width: "auto" }}
              />{" "}
              Attach the full screenshot to the Jira issue
            </span>
          </label>
        )}
        {error && (
          <p className="warning" role="alert">
            {error}
          </p>
        )}
        {confirm && (
          <p className="warning">
            Confirm creation of <strong>{draft.title}</strong> as a{" "}
            {types.find((type) => type.id === typeId)?.name} in{" "}
            <strong>{project}</strong>.
          </p>
        )}
        <footer>
          {discard && (
            <button
              className="button"
              disabled={busy}
              onClick={() => {
                if (confirmDiscard) discard();
                else setConfirmDiscard(true);
              }}
            >
              {confirmDiscard ? "Confirm discard" : "Discard draft"}
            </button>
          )}
          <button className="button" onClick={onClose} disabled={busy}>
            Done
          </button>
          {mode === "Atlassian" && (
            <button
              className="button primary"
              disabled={
                busy ||
                !typeId ||
                !!required.length ||
                !draft.title.trim() ||
                !draft.description.trim()
              }
              onClick={() => {
                if (!confirm) {
                  setConfirm(true);
                  return;
                }
                void run(async () => {
                  const saved = await prepare();
                  return created(
                    await context.createIssue({
                      project,
                      typeId,
                      ...saved,
                      attachScreenshot: attach,
                      requestId,
                    }),
                  );
                });
              }}
            >
              {confirm ? "Confirm Jira issue" : "Create Jira issue"}
            </button>
          )}
        </footer>
      </div>
    </Modal>
  );
}

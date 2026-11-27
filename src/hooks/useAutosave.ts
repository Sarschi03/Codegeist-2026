import { useCallback, useEffect, useRef, useState } from "react";
import { db, type WorkspaceRepository } from "../data/repository";
import type { Workspace } from "../shared/model";
type Status = "Saved" | "Unsaved" | "Saving" | "Save failed";
export function useAutosave(
  initial: Workspace,
  repository: WorkspaceRepository,
  recover: boolean,
) {
  const [workspace, setWorkspace] = useState(initial);
  const [status, setStatus] = useState<Status>("Saved");
  const [error, setError] = useState("");
  const current = useRef(initial);
  const expected = useRef(initial.revision);
  const dirty = useRef(false);
  const timer = useRef<number>(undefined);
  const recoveryTimer = useRef<number>(undefined);
  const checkpoint = useCallback(() => {
    if (!recover || recoveryTimer.current !== undefined) return;
    recoveryTimer.current = window.setTimeout(() => {
      recoveryTimer.current = undefined;
      if (dirty.current)
        void db.recovery
          .put({ ...current.current, revision: expected.current })
          .catch(() => undefined);
    }, 200);
  }, [recover]);
  const pending = useRef<Promise<boolean> | null>(null);
  const save = useCallback(
    async function flush(): Promise<boolean> {
      window.clearTimeout(timer.current);
      if (pending.current) {
        if (!(await pending.current)) return false;
        return dirty.current ? flush() : true;
      }
      if (!dirty.current) return true;
      const snapshot = current.current;
      setStatus("Saving");
      const operation = (async () => {
        try {
          const saved = await repository.save(snapshot, expected.current);
          expected.current = saved.revision;
          if (current.current === snapshot) {
            dirty.current = false;
            current.current = saved;
            setWorkspace(saved);
            setStatus("Saved");
            if (recover)
              void db.recovery.delete(saved.id).catch(() => undefined);
          } else {
            checkpoint();
            setStatus("Unsaved");
            timer.current = window.setTimeout(() => void flush(), 500);
          }
          setError("");
          return true;
        } catch (problem) {
          setStatus("Save failed");
          setError(problem instanceof Error ? problem.message : "Save failed.");
          return false;
        }
      })();
      pending.current = operation;
      try {
        return await operation;
      } finally {
        pending.current = null;
      }
    },
    [repository, recover, checkpoint],
  );
  const update = useCallback(
    (change: (value: Workspace) => Workspace) => {
      current.current = {
        ...change(current.current),
        revision: expected.current,
      };
      dirty.current = true;
      setWorkspace(current.current);
      setStatus("Unsaved");
      checkpoint();
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        void save();
      }, 750);
    },
    [checkpoint, save],
  );
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (dirty.current) {
        event.preventDefault();
        event.returnValue = true;
      }
    };
    const hidden = () => {
      if (document.visibilityState === "hidden" && dirty.current) {
        if (recover)
          void db.recovery.put(current.current).catch(() => undefined);
        void save();
      }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.clearTimeout(timer.current);
      window.clearTimeout(recoveryTimer.current);
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [recover, save]);
  return { workspace, current, status, error, save, update };
}

import { Route } from "lucide-react";
import type { Mode } from "../data/services";
export function Brand({ onClick }: { onClick: () => void }) {
  return (
    <button className="brand" onClick={onClick}>
      <span>
        <Route size={19} />
      </span>
      Trace
    </button>
  );
}
export function ModeBadge({ mode }: { mode: Mode }) {
  return (
    <span className="mode">
      <i />
      {mode === "Convex"
        ? "Convex demo"
        : mode === "Atlassian"
          ? "Atlassian"
          : "Demo mode"}
    </span>
  );
}

import type { ReactElement } from "react";
import { useSearchParams } from "react-router-dom";
import { AnnouncementsPage } from "./AnnouncementsPage";
import { PopupsPage } from "./PopupsPage";

/** F-22 (interim): User interactions opens the Pop-ups or Announcements screen by ?kind= until the new page lands. */
export function InteractionsPage(): ReactElement {
  const [params, setParams] = useSearchParams();
  const kind = params.get("kind") === "announcement" ? "announcement" : "popup";
  return (
    <>
      <div className="seg" role="group" aria-label="Show" style={{ marginBottom: 16 }}>
        <button type="button" className={kind === "popup" ? "on" : ""} aria-pressed={kind === "popup"} onClick={() => setParams({ kind: "popup" })}>
          Pop-ups
        </button>
        <button
          type="button"
          className={kind === "announcement" ? "on" : ""}
          aria-pressed={kind === "announcement"}
          onClick={() => setParams({ kind: "announcement" })}
        >
          Announcements
        </button>
      </div>
      {kind === "announcement" ? <AnnouncementsPage /> : <PopupsPage />}
    </>
  );
}

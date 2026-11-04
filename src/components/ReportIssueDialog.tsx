import { useState, type ReactElement } from "react";
import { ApiError, reportStaffIssue } from "../lib/api";
import { refreshBadges } from "../lib/badges";
import { Modal } from "./Modal";
import { useToast } from "./Toast";
import "../styles/report-issue.css";

const MAX_SHOT_BYTES = 5 * 1024 * 1024;
const SHOT_TYPES = ["image/png", "image/jpeg", "image/webp"];

/**
 * F-13 (v1.3.3): staff report a problem they hit in this panel. It lands in Issues with a Staff tag
 * (POST /api/admin/issues/report/, multipart). The page is filled in with where they are now.
 */
export function ReportIssueDialog({ page, onClose }: { page: string; onClose: () => void }): ReactElement {
  const toast = useToast();
  const [description, setDescription] = useState("");
  const [where, setWhere] = useState(page);
  const [shot, setShot] = useState<File | null>(null);
  const [shotErr, setShotErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const pick = (file: File | null) => {
    setShotErr("");
    if (!file) {
      setShot(null);
      return;
    }
    if (!SHOT_TYPES.includes(file.type)) {
      setShot(null);
      setShotErr("Use a PNG, JPG or WebP picture.");
      return;
    }
    if (file.size > MAX_SHOT_BYTES) {
      setShot(null);
      setShotErr("The picture is over 5 MB. Crop it or save it as JPG.");
      return;
    }
    setShot(file);
  };

  const send = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await reportStaffIssue({ description: description.trim(), page: where.trim(), screenshot: shot });
      refreshBadges();
      toast(res?.id ? `Sent. It’s issue #${res.id} in Issues.` : "Sent. It’s in Issues with a Staff tag.");
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn’t send it. Try again.");
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Report an issue"
      subtitle="Something in this panel didn’t work? Tell us what happened. It goes to Issues with a Staff tag."
      onClose={() => (busy ? undefined : onClose())}
      className="ri-dialog"
      footer={
        <>
          <button type="button" className="btn" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn dark" disabled={busy || description.trim().length < 3} onClick={() => void send()}>
            {busy ? "Sending…" : "Send report"}
          </button>
        </>
      }
    >
      <label className="ri-fl">
        What went wrong
        <textarea
          className="ta"
          rows={5}
          maxLength={4000}
          autoFocus
          value={description}
          placeholder="I clicked Save on Plans and pricing and nothing happened."
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <label className="ri-fl">
        Page
        <input className="inp mono" maxLength={300} value={where} onChange={(e) => setWhere(e.target.value)} />
        <span className="k">Filled in with the page you are on.</span>
      </label>
      <label className="ri-fl">
        Screenshot <span className="k">· optional, PNG, JPG or WebP up to 5 MB</span>
        <input
          className="ri-file"
          type="file"
          accept={SHOT_TYPES.join(",")}
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
        />
        {shot ? <span className="k">{shot.name} · {Math.max(1, Math.round(shot.size / 1024))} KB</span> : null}
        {shotErr ? (
          <span className="ri-err" role="alert">
            {shotErr}
          </span>
        ) : null}
      </label>
      {error ? (
        <p className="err-box" role="alert">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}

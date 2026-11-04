import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { ApiError } from "../lib/api";
import { useLoad } from "../lib/useLoad";
import {
  animatedUrl,
  createZingle,
  deleteZingle,
  getZingles,
  placesOf,
  stillUrl,
  updateZingle,
  whereLabel,
  whereOf,
  zingleState,
  type Zingle,
  type ZingleInput,
  type ZingleState,
  type ZingleWhere,
} from "../lib/zinglesApi";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "../components/States";
import { Icon } from "../components/icons";
import { useToast } from "../components/Toast";
import "../styles/zingles.css";

/** The site nav shows the wordmark 28 px high (zinwe-frontend Brand); its files are 837 x 206. */
const NAV_LOGO_H = 28;
const LOGO_ASPECT = 837 / 206;
const MAX_ANIMATED = 2 * 1024 * 1024;

/** The Windows app's title bar shows the logo 22 px high. */
const APP_LOGO_H = 22;

const WHERE: [keyof ZingleWhere, string, string][] = [
  ["website", "Website", "zinwe.io and the sign-in page"],
  ["dashboard", "Dashboard", "the customer dashboard"],
  ["app", "Windows app", "the Windows app’s title bar"],
];

const STATE: Record<ZingleState, [string, string]> = {
  live: ["Live", "accent"],
  scheduled: ["Scheduled", "info"],
  ended: ["Ended", "muted"],
  off: ["Off", "muted"],
};

/* ---------- dates (local time, as the announcement board) ---------- */

const pad = (n: number) => String(n).padStart(2, "0");

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** "1 Nov, 18:00" (year added when it isn't this year). */
function fmt(iso: string | null): string {
  if (!iso) return "no end";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const year = d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : "";
  return `${d.getDate()} ${d.toLocaleString("en-GB", { month: "short" })}${year}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A picked file as a preview URL, released when it changes. */
function useObjectUrl(file: File | null): string {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!file) {
      setUrl("");
      return;
    }
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url;
}

/* ---------- the mock nav bar ---------- */

/**
 * The website's top bar with the Zingle in the logo's place, at the real logo size (28 px high), so staff see what
 * visitors will see. `still` shows the PNG that people who turned off animations get.
 */
function NavPreview({ src, alt, compact }: { src: string; alt: string; compact?: boolean }): ReactElement {
  const width = Math.round(NAV_LOGO_H * LOGO_ASPECT);
  return (
    <div className={"zg-nav" + (compact ? " zg-nav--compact" : "")} aria-label="Preview in the website’s top bar" role="img">
      {src ? (
        <img className="zg-nav__logo" src={src} alt={alt} height={NAV_LOGO_H} style={{ maxWidth: width + 40 }} />
      ) : (
        <img className="zg-nav__logo" src="/brand/zinwe-logo-96.png" alt="Zinwe" height={NAV_LOGO_H} width={width} />
      )}
      {compact ? null : (
        <>
          <span className="zg-nav__links" aria-hidden="true">
            <span>Product</span>
            <span>Plans</span>
            <span>Blog</span>
          </span>
          <span className="zg-nav__right" aria-hidden="true">
            <span>Log in</span>
            <span className="zg-nav__cta">Start free</span>
          </span>
        </>
      )}
    </div>
  );
}

/** The Windows app's title bar: white, the Zingle 22 px high at the left, minimise and close at the right. */
function AppPreview({ src, alt }: { src: string; alt: string }): ReactElement {
  const width = Math.round(APP_LOGO_H * LOGO_ASPECT);
  return (
    <div className="zg-app" aria-label="Preview in the Windows app’s title bar" role="img">
      {src ? (
        <img className="zg-app__logo" src={src} alt={alt} height={APP_LOGO_H} style={{ maxWidth: width + 32 }} />
      ) : (
        <img className="zg-app__logo" src="/brand/zinwe-logo-96.png" alt="Zinwe" height={APP_LOGO_H} width={width} />
      )}
      <span className="zg-app__ctl" aria-hidden="true">
        <svg viewBox="0 0 10 10" width="10" height="10">
          <path d="M0 5.5h10" stroke="currentColor" strokeWidth="1" />
        </svg>
        <svg viewBox="0 0 10 10" width="10" height="10">
          <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" stroke="currentColor" strokeWidth="1" />
        </svg>
      </span>
    </div>
  );
}

/* ---------- editor ---------- */

type Draft = Omit<ZingleInput, "animated" | "still"> & { id: number | "new"; animatedUrl: string; stillUrl: string };

function blankDraft(): Draft {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 3 * 24 * 3600 * 1000);
  return {
    id: "new",
    name: "",
    alt: "Zinwe",
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    places: "both",
    show_app: false,
    is_active: true,
    animatedUrl: "",
    stillUrl: "",
  };
}

function draftOf(z: Zingle): Draft {
  return {
    id: z.id,
    name: z.name,
    alt: z.alt,
    starts_at: z.starts_at,
    ends_at: z.ends_at,
    places: z.places,
    show_app: Boolean(z.show_app),
    is_active: z.is_active,
    animatedUrl: animatedUrl(z),
    stillUrl: stillUrl(z),
  };
}

function Editor({ draft, others, onClose, onSaved }: { draft: Draft; others: Zingle[]; onClose: () => void; onSaved: () => void }): ReactElement {
  const toast = useToast();
  const [d, setD] = useState(draft);
  const [animated, setAnimated] = useState<File | null>(null);
  const [still, setStill] = useState<File | null>(null);
  const [fileErr, setFileErr] = useState<{ animated?: string; still?: string }>({});
  const [showStill, setShowStill] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const animatedPick = useObjectUrl(animated);
  const stillPick = useObjectUrl(still);
  const patch = (p: Partial<Draft>) => setD((cur) => ({ ...cur, ...p }));
  const isNew = d.id === "new";

  const pickAnimated = (f: File | null) => {
    setFileErr((e) => ({ ...e, animated: undefined }));
    if (!f) return setAnimated(null);
    if (!["image/gif", "image/webp"].includes(f.type)) {
      setAnimated(null);
      return setFileErr((e) => ({ ...e, animated: "Use an animated GIF or WebP." }));
    }
    if (f.size > MAX_ANIMATED) {
      setAnimated(null);
      return setFileErr((e) => ({ ...e, animated: `It’s ${(f.size / 1024 / 1024).toFixed(1)} MB. Keep it under 2 MB (aim for 150 KB).` }));
    }
    setAnimated(f);
  };
  const pickStill = (f: File | null) => {
    setFileErr((e) => ({ ...e, still: undefined }));
    if (!f) return setStill(null);
    if (f.type !== "image/png") {
      setStill(null);
      return setFileErr((e) => ({ ...e, still: "Use a PNG." }));
    }
    setStill(f);
  };

  const animatedSrc = animatedPick || d.animatedUrl;
  const stillSrc = stillPick || d.stillUrl;
  const where = whereOf(d.places, d.show_app);
  const setWhere = (k: keyof ZingleWhere, on: boolean) => {
    const next = { ...where, [k]: on };
    patch({ places: placesOf(next), show_app: next.app });
  };
  const whereText = WHERE.filter(([k]) => where[k]).map(([, , t]) => t);
  const endBad = Boolean(d.ends_at && new Date(d.ends_at).getTime() <= new Date(d.starts_at).getTime());
  const missing = !d.name.trim()
    ? "Give it a name."
    : !animatedSrc
      ? "Add the animated GIF or WebP."
      : !stillSrc
        ? "Add the still PNG."
        : !d.alt.trim()
          ? "Write the alt text."
          : !where.website && !where.dashboard && !where.app
            ? "Choose where it shows."
            : !d.ends_at
              ? "Pick when it ends."
              : endBad
                ? "The end must be after the start."
                : "";

  // Two Zingles at once on the same place: the one that starts later shows.
  const clash = others.find((z) => {
    if (z.id === d.id || !z.is_active || !d.is_active) return false;
    const zw = whereOf(z.places, Boolean(z.show_app));
    const placesMeet = (zw.website && where.website) || (zw.dashboard && where.dashboard) || (zw.app && where.app);
    const zEnd = z.ends_at ? new Date(z.ends_at).getTime() : Infinity;
    const dEnd = d.ends_at ? new Date(d.ends_at).getTime() : Infinity;
    return placesMeet && new Date(z.starts_at).getTime() < dEnd && new Date(d.starts_at).getTime() < zEnd;
  });

  const save = async () => {
    setBusy(true);
    setError("");
    const input: ZingleInput = {
      name: d.name.trim(),
      alt: d.alt.trim(),
      starts_at: d.starts_at,
      ends_at: d.ends_at,
      places: d.places,
      show_app: d.show_app,
      is_active: d.is_active,
      animated,
      still,
    };
    try {
      if (d.id === "new") await createZingle(input);
      else await updateZingle(d.id, input);
      toast(isNew ? "Zingle saved." : "Changes saved.");
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn’t save it. Try again.");
      setBusy(false);
    }
  };

  return (
    <Modal
      title={isNew ? "New Zingle" : `Edit ${draft.name}`}
      subtitle="Our logo, animated for a special day. It takes the logo’s place while it’s live."
      onClose={() => (busy ? undefined : onClose())}
      className="zg-dialog"
      footer={
        <>
          {missing ? <span className="k zg-missing">{missing}</span> : null}
          <button type="button" className="btn" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn dark" disabled={busy || Boolean(missing)} onClick={() => void save()}>
            {busy ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <div className="zg-form">
        <label className="zg-fl">
          Name
          <input className="inp" maxLength={80} autoFocus placeholder="Diwali 2026" value={d.name} onChange={(e) => patch({ name: e.target.value })} />
        </label>

        <div className="zg-two">
          <label className="zg-fl">
            Animated · GIF or WebP, up to 2 MB
            <input className="zg-file" type="file" accept="image/gif,image/webp" onChange={(e) => pickAnimated(e.target.files?.[0] ?? null)} />
            <span className="k">
              {animated ? `${animated.name} · ${Math.max(1, Math.round(animated.size / 1024))} KB` : d.animatedUrl ? "Keeps the current file" : "Same shape as the logo, 390 × 96"}
            </span>
            {fileErr.animated ? (
              <span className="zg-err" role="alert">
                {fileErr.animated}
              </span>
            ) : null}
          </label>
          <label className="zg-fl">
            Still · PNG
            <input className="zg-file" type="file" accept="image/png" onChange={(e) => pickStill(e.target.files?.[0] ?? null)} />
            <span className="k">
              {still ? still.name : d.stillUrl ? "Keeps the current file" : "Shown to people who turn off animations"}
            </span>
            {fileErr.still ? (
              <span className="zg-err" role="alert">
                {fileErr.still}
              </span>
            ) : null}
          </label>
        </div>

        <label className="zg-fl">
          Alt text
          <input className="inp" maxLength={120} placeholder="Zinwe, with diyas for Diwali" value={d.alt} onChange={(e) => patch({ alt: e.target.value })} />
          <span className="k">Read out by screen readers instead of the logo.</span>
        </label>

        <div className="zg-two">
          <label className="zg-fl">
            Starts
            <input
              className="inp"
              type="datetime-local"
              value={toLocalInput(d.starts_at)}
              onChange={(e) => patch({ starts_at: fromLocalInput(e.target.value) ?? d.starts_at })}
            />
          </label>
          <label className="zg-fl">
            Ends
            <input
              className={"inp" + (endBad ? " bad" : "")}
              type="datetime-local"
              value={toLocalInput(d.ends_at)}
              onChange={(e) => patch({ ends_at: fromLocalInput(e.target.value) })}
            />
          </label>
        </div>

        <fieldset className="zg-set">
          <legend className="lab">Where it shows</legend>
          <div className="zg-where">
            {WHERE.map(([k, l]) => (
              <label key={k} className="zg-check">
                <input type="checkbox" checked={where[k]} onChange={(e) => setWhere(k, e.target.checked)} />
                {k === "website" ? (
                  <span>
                    {l} <span className="k">incl. sign-in</span>
                  </span>
                ) : (
                  <span>{l}</span>
                )}
              </label>
            ))}
          </div>
          <span className="k">{whereText.length ? `On ${whereText.join(", ")}.` : "Pick at least one."}</span>
        </fieldset>

        <label className="sw">
          <input type="checkbox" role="switch" checked={d.is_active} onChange={(e) => patch({ is_active: e.target.checked })} />
          <span className="tr" aria-hidden="true">
            <span />
          </span>
          {d.is_active ? "On: shows between the start and the end" : "Off: never shows"}
        </label>

        {clash ? (
          <p className="zg-note" role="status">
            “{clash.name}” is on for some of the same days and places. The one that starts later shows.
          </p>
        ) : null}

        <section className="zg-pv" aria-labelledby="zg-pv-h">
          <div className="zg-pv__head">
            <h3 id="zg-pv-h">Preview at the real logo size</h3>
            <div className="seg sm" role="group" aria-label="Preview">
              <button type="button" className={showStill ? "" : "on"} aria-pressed={!showStill} onClick={() => setShowStill(false)}>
                Animated
              </button>
              <button type="button" className={showStill ? "on" : ""} aria-pressed={showStill} onClick={() => setShowStill(true)}>
                Still
              </button>
            </div>
          </div>
          <span className="k">Website top bar</span>
          <NavPreview src={showStill ? stillSrc : animatedSrc} alt={d.alt || "Zinwe"} />
          <span className="k">Windows app title bar</span>
          <AppPreview src={showStill ? stillSrc : animatedSrc} alt={d.alt || "Zinwe"} />
          <span className="k">
            {showStill ? "What people who turn off animations see." : "Plays on a loop. Keep it short and calm: about 3 seconds."}
          </span>
        </section>

        {error ? (
          <p className="err-box" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

/* ---------- page ---------- */

/**
 * Zingles (F-15): our own animated logo for special days (Diwali, New Year...). Each one has an animated GIF/WebP, a
 * still PNG for reduced motion, dates and places; while it's live, the website, dashboard and/or Windows app show
 * it in the logo's place. CRUD on /api/admin/zingles/ (multipart).
 */
export function ZinglesPage(): ReactElement {
  const load = useCallback(() => getZingles(), []);
  const { data, error, pending, reload } = useLoad(load);
  const toast = useToast();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<Zingle | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const rows = useMemo(
    () => [...(data ?? [])].sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime()),
    [data],
  );
  const live = rows.filter((z) => zingleState(z) === "live");

  const toggle = async (z: Zingle) => {
    setBusy(z.id);
    try {
      await updateZingle(z.id, { is_active: !z.is_active });
      toast(z.is_active ? `${z.name} is off.` : `${z.name} is on.`);
      reload();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn’t change that.", "bad");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Zingles"
        subtitle="Our logo, animated for special days. While one is live it takes the logo’s place on the website, the sign-in page, the dashboard and the Windows app, wherever you choose."
        onReload={reload}
        pending={pending}
      >
        <button type="button" className="btn dark" onClick={() => setEditing(blankDraft())}>
          <Icon name="plus" />
          New Zingle
        </button>
      </PageHeader>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <LoadingState rows={3} label="Loading Zingles…" />
      ) : rows.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="zingle"
            title="No Zingles yet"
            body="Add one for the next festival: an animated GIF or WebP of the logo, a still PNG, and the days it shows."
            action={
              <button type="button" className="btn dark" onClick={() => setEditing(blankDraft())}>
                New Zingle
              </button>
            }
          />
        </div>
      ) : (
        <>
          <p className="k zg-now">
            {live.length
              ? `Showing now: ${live.map((z) => `${z.name} (${whereLabel(z.places, Boolean(z.show_app)).toLowerCase()})`).join(", ")}.`
              : "Nothing showing now: everyone sees the normal logo."}
          </p>
          <section className="card zg-list" aria-label="Zingles">
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th scope="col">Preview</th>
                    <th scope="col">Name</th>
                    <th scope="col">Dates</th>
                    <th scope="col">Where</th>
                    <th scope="col">State</th>
                    <th scope="col">
                      <span className="sr">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((z) => {
                    const st = zingleState(z);
                    return (
                      <tr key={z.id}>
                        <td>
                          <NavPreview compact src={animatedUrl(z) || stillUrl(z)} alt={z.alt} />
                        </td>
                        <th scope="row">{z.name}</th>
                        <td className="num">
                          {fmt(z.starts_at)} → {fmt(z.ends_at)}
                        </td>
                        <td>{whereLabel(z.places, Boolean(z.show_app))}</td>
                        <td>
                          <span className={`pill ${STATE[st][1]}`}>{STATE[st][0]}</span>
                        </td>
                        <td>
                          <div className="zg-acts">
                            <button type="button" className="btn sm" onClick={() => setEditing(draftOf(z))}>
                              Edit
                            </button>
                            <button type="button" className="btn sm" disabled={busy === z.id} onClick={() => void toggle(z)}>
                              {z.is_active ? "Turn off" : "Turn on"}
                            </button>
                            <button type="button" className="btn sm danger" onClick={() => setDeleting(z)}>
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {editing ? (
        <Editor
          draft={editing}
          others={rows}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      ) : null}

      {deleting ? (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          confirmLabel="Delete"
          danger
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await deleteZingle(deleting.id);
            toast("Deleted.");
            reload();
          }}
        >
          Its files are removed. If it’s live, the normal logo comes back within 5 minutes.
        </ConfirmDialog>
      ) : null}
    </>
  );
}

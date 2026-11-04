import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import {
  ApiError,
  createAnnouncement,
  deleteAnnouncement,
  getPlans,
  getPopupReach,
  getPopups,
  searchOwners,
  updateAnnouncement,
  type Announcement,
  type AnnouncementAudience,
  type AnnouncementInput,
  type AnnouncementKind,
  type OwnerHit,
  type PlanSummary,
} from "../lib/api";
import { titleCase } from "../lib/format";
import { useLoad } from "../lib/useLoad";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { MomentArt, MomentPreview } from "../components/MomentPreview";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { NO_PICTURE_EDIT, PicturePicker, pictureChange, usePictureSrc, type PictureEdit } from "../components/PicturePicker";
import { EmptyState, ErrorState, LoadingState } from "../components/States";
import { Icon } from "../components/icons";
import { useToast } from "../components/Toast";
import "../styles/announcements.css";
import "../styles/popups.css";

/* ---------- Vocabulary ---------- */

const KINDS: [AnnouncementKind, string][] = [
  ["offer", "Offer"],
  ["news", "News"],
  ["version", "New version"],
  ["wish", "Wish"],
];
/** Every kind a saved pop-up may have (older ones may be a discount or maintenance). */
const KIND_LABEL: Record<AnnouncementKind, string> = {
  offer: "Offer",
  discount: "Discount",
  news: "News",
  version: "New version",
  wish: "Wish",
  maintenance: "Maintenance",
};
/** What a paid plan may see as a pop-up (the server's rule, D5). */
const PAID_KINDS: ReadonlySet<AnnouncementKind> = new Set(["news", "version", "wish", "maintenance"]);

type Who = "everyone" | "free" | "paid" | "plans" | "owners";
const WHO: [Who, string][] = [
  ["everyone", "Everyone"],
  ["free", "Free plans"],
  ["paid", "Paid plans"],
  ["plans", "Specific plans"],
  ["owners", "Specific people"],
];

const STATE: Record<Announcement["status"], [string, string]> = {
  live: ["Live", "accent"],
  scheduled: ["Scheduled", "info"],
  ended: ["Ended", "muted"],
  off: ["Off", "muted"],
};

const RHYTHM =
  "Each owner sees it at their first login after it goes live, then after 2 days, then after a week: at most 3 views, one pop-up a day. Paid plans only see news, new versions, wishes and maintenance.";

/* ---------- Helpers ---------- */

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmt(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const year = d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : "";
  return `${d.getDate()} ${MON[d.getMonth()]}${year}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
function offerButton(price: string | null): string {
  const n = Number(price);
  return Number.isFinite(n) && n > 0 ? `Upgrade for ₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2 })} + GST` : "Upgrade";
}
function linkError(href: string): string | null {
  const v = href.trim();
  if (!v) return null;
  if (v.startsWith("/") && !v.startsWith("//")) return null;
  if (v.startsWith("https://")) return null;
  if (/^mailto:[^@\s]+@[^@\s]+\.[^@\s]+$/i.test(v)) return null;
  if (v.startsWith("http://")) return "Use https:// (secure links only).";
  return "Use a dashboard page starting with / or an https:// link.";
}
const isPaidPlan = (p: PlanSummary) => Number(p.price_inr_monthly) > 0;

function emptyDraft(): AnnouncementInput {
  return {
    title: "",
    body: "",
    kind: "news",
    placement: "popup",
    audience: "everyone",
    plan_codes: [],
    owner_emails: [],
    cta_label: "",
    cta_href: "",
    offer_plan: null,
    offer_price_inr: null,
    starts_at: new Date().toISOString(),
    ends_at: null,
    is_active: true,
    dismissible: true,
    priority: 0,
  };
}
function toDraft(a: Announcement): AnnouncementInput {
  const { id: _id, status: _s, created_by: _c, created_at: _ca, updated_at: _u, offer_uses: _o, image_url: _i, stats: _st, ...input } = a;
  return input;
}

/** "Everyone", "Free plans", "Paid plans", "Plans: Startups, Teams", "3 people". */
function whoLabel(a: Pick<AnnouncementInput, "audience" | "plan_codes" | "owner_emails">, planName: (code: string) => string): string {
  if (a.audience === "everyone") return "Everyone";
  if (a.audience === "free") return "Free plans";
  if (a.audience === "paid") return "Paid plans";
  if (a.audience === "plans") return `Plans: ${a.plan_codes.map(planName).join(", ") || "none"}`;
  const n = a.owner_emails.length;
  return n === 1 ? "1 person" : `${n} people`;
}

/** Selling to a paid-plan audience: the server never shows offers to paid plans. */
function offerToPaid(d: AnnouncementInput, plans: PlanSummary[]): boolean {
  if (PAID_KINDS.has(d.kind)) return false;
  if (d.audience === "paid") return true;
  if (d.audience === "plans") return d.plan_codes.some((c) => plans.find((p) => p.code === c && isPaidPlan(p)));
  return false;
}

/** The saved picture as a file, so a duplicate keeps it (null when there's none or it can't be read). */
async function pictureFile(a: Announcement): Promise<File | null> {
  if (!a.image_url) return null;
  try {
    const res = await fetch(a.image_url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
    return new File([blob], `picture.${ext}`, { type: blob.type });
  } catch {
    return null;
  }
}

/* ---------- Page ---------- */

type Editing = { id: number | "new"; draft: AnnouncementInput; savedPicture: string | null; picture: PictureEdit };

/**
 * Pop-ups: the moments pop-ups over the customer dashboard (Announcements with placement "popup"), with their
 * numbers (owners who saw it, views, closed, button presses). The Announcements page still lists them with the bars.
 */
export function PopupsPage(): ReactElement {
  const load = useCallback(() => getPopups(), []);
  const { data, error, pending, reload } = useLoad(load);
  const loadPlans = useCallback(() => getPlans(), []);
  const plans = useLoad(loadPlans);
  const toast = useToast();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<Announcement | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const planList = useMemo(() => plans.data ?? [], [plans.data]);
  const planName = (code: string) => planList.find((p) => p.code === code)?.name ?? titleCase(code);
  const rows = useMemo(() => (data ?? []).filter((a) => a.placement === "popup"), [data]);
  const live = rows.filter((a) => a.status === "live");

  const toggle = async (a: Announcement) => {
    setBusy(a.id);
    try {
      await updateAnnouncement(a.id, { is_active: !a.is_active });
      toast(a.is_active ? `“${a.title}” is off.` : `“${a.title}” is on.`);
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn’t change that.", "bad");
    } finally {
      setBusy(null);
    }
  };

  const duplicate = async (a: Announcement) => {
    setBusy(a.id);
    const file = await pictureFile(a);
    setBusy(null);
    setEditing({
      id: "new",
      draft: { ...toDraft(a), title: a.title, starts_at: new Date().toISOString(), ends_at: null, is_active: true },
      savedPicture: null,
      picture: file ? { file, removed: false } : NO_PICTURE_EDIT,
    });
  };

  return (
    <>
      <PageHeader
        title="Pop-ups"
        subtitle="A pop-up over the customer dashboard, with a picture, a short line and one button. It opens on its own rhythm and never more than once a day."
        onReload={reload}
        pending={pending}
      >
        <button type="button" className="btn dark" onClick={() => setEditing({ id: "new", draft: emptyDraft(), savedPicture: null, picture: NO_PICTURE_EDIT })}>
          <Icon name="plus" />
          New pop-up
        </button>
      </PageHeader>

      <p className="k pu-rhythm">{RHYTHM}</p>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <LoadingState rows={3} label="Loading pop-ups…" />
      ) : rows.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="popup"
            title="No pop-ups yet"
            body="Add one for news, a new version, a festival wish or an offer for free plans."
            action={
              <button type="button" className="btn dark" onClick={() => setEditing({ id: "new", draft: emptyDraft(), savedPicture: null, picture: NO_PICTURE_EDIT })}>
                New pop-up
              </button>
            }
          />
        </div>
      ) : (
        <>
          <p className="k pu-now">
            {live.length ? `Live now: ${live.map((a) => `“${a.title}”`).join(", ")}.` : "No pop-up is live now."}
          </p>
          <section className="card pu-list" aria-label="Pop-ups">
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th scope="col">Picture</th>
                    <th scope="col">Title</th>
                    <th scope="col">Who sees it</th>
                    <th scope="col">Dates</th>
                    <th scope="col">State</th>
                    <th scope="col" className="pu-n" title="Owners who saw it">
                      Saw it
                    </th>
                    <th scope="col" className="pu-n">
                      Views
                    </th>
                    <th scope="col" className="pu-n" title="Owners who closed it for good">
                      Closed
                    </th>
                    <th scope="col" className="pu-n" title="Owners who pressed the button">
                      Clicked
                    </th>
                    <th scope="col">
                      <span className="sr">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => {
                    const st = STATE[a.status];
                    const s = a.stats;
                    return (
                      <tr key={a.id}>
                        <td>
                          {a.image_url ? <img className="pu-thumb" src={a.image_url} alt="" /> : <MomentArt kind={a.kind} className="pu-thumb" />}
                        </td>
                        <th scope="row">
                          <span className="pu-title">{a.title}</span>
                          <span className="k">{KIND_LABEL[a.kind]}</span>
                        </th>
                        <td>{whoLabel(a, planName)}</td>
                        <td className="num pu-dates">
                          {fmt(a.starts_at)}
                          <span className="k">{a.ends_at ? `to ${fmt(a.ends_at)}` : "no end date"}</span>
                        </td>
                        <td>
                          <span className={`pill ${st[1]}`}>{st[0]}</span>
                        </td>
                        <td className="num pu-n">{s ? s.owners : "–"}</td>
                        <td className="num pu-n">{s ? s.views : "–"}</td>
                        <td className="num pu-n">{s ? s.closed : "–"}</td>
                        <td className="num pu-n" title={s ? `${s.clicks} presses in all` : undefined}>
                          {s ? s.clicked_owners : "–"}
                        </td>
                        <td>
                          <div className="pu-acts">
                            <button
                              type="button"
                              className="btn sm"
                              onClick={() => setEditing({ id: a.id, draft: toDraft(a), savedPicture: a.image_url, picture: NO_PICTURE_EDIT })}
                            >
                              Edit
                            </button>
                            <button type="button" className="btn sm" disabled={busy === a.id} onClick={() => void toggle(a)}>
                              {a.is_active ? "Turn off" : "Turn on"}
                            </button>
                            <button type="button" className="btn sm" disabled={busy === a.id} onClick={() => void duplicate(a)}>
                              Duplicate
                            </button>
                            <button type="button" className="btn sm danger" onClick={() => setDeleting(a)}>
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
          editing={editing}
          plans={planList}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            setEditing(null);
            toast(msg);
            reload();
          }}
        />
      ) : null}

      {deleting ? (
        <ConfirmDialog
          title={`Delete “${deleting.title}”?`}
          confirmLabel="Delete"
          danger
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await deleteAnnouncement(deleting.id);
            setDeleting(null);
            toast("Deleted.");
            reload();
          }}
        >
          <p>It stops showing at once and its numbers and picture are removed. This can’t be undone.</p>
        </ConfirmDialog>
      ) : null}
    </>
  );
}

/* ---------- Editor ---------- */

type FieldKey = "title" | "body" | "cta_label" | "cta_href" | "plan_codes" | "owner_emails" | "offer_plan" | "offer_price_inr" | "ends_at";
const FIELD_KEYS: ReadonlyArray<string> = ["title", "body", "cta_label", "cta_href", "plan_codes", "owner_emails", "offer_plan", "offer_price_inr", "ends_at"];

function validate(d: AnnouncementInput): Partial<Record<FieldKey, string>> {
  const errors: Partial<Record<FieldKey, string>> = {};
  if (!d.title.trim()) errors.title = "Write the title owners will see.";
  if ((d.kind === "offer" || d.kind === "discount") && d.offer_plan) {
    const price = Number(d.offer_price_inr);
    if (!d.offer_price_inr || !Number.isFinite(price)) errors.offer_price_inr = "Write the special price.";
    else if (price < 1) errors.offer_price_inr = "At least ₹1.00 (online payments can't be smaller).";
  } else {
    const label = d.cta_label.trim();
    const href = d.cta_href.trim();
    if (label && !href) errors.cta_href = "Add where the button goes, or clear the button text.";
    else if (href && !label) errors.cta_label = "Add the button text, or clear the link.";
    const bad = linkError(href);
    if (bad) errors.cta_href = bad;
  }
  if (d.audience === "plans" && d.plan_codes.length === 0) errors.plan_codes = "Pick at least one plan.";
  if (d.audience === "owners" && d.owner_emails.length === 0) errors.owner_emails = "Add at least one person.";
  if (d.ends_at && new Date(d.ends_at).getTime() <= new Date(d.starts_at).getTime()) errors.ends_at = "The end must be after the start.";
  return errors;
}

function Editor({
  editing,
  plans,
  onClose,
  onSaved,
}: {
  editing: Editing;
  plans: PlanSummary[];
  onClose: () => void;
  onSaved: (message: string) => void;
}): ReactElement {
  const isNew = editing.id === "new";
  const [d, setD] = useState<AnnouncementInput>(editing.draft);
  const [picture, setPicture] = useState<PictureEdit>(editing.picture);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pictureSrc = usePictureSrc(picture, editing.savedPicture);
  const reach = usePopupReach(d);
  const paidPlans = plans.filter(isPaidPlan);
  // "Offer" with a special price builds its own link; the button text is optional then.
  const withPrice = (d.kind === "offer" || d.kind === "discount") && Boolean(d.offer_plan);
  const button = withPrice ? d.cta_label.trim() || offerButton(d.offer_price_inr) : d.cta_label.trim() && d.cta_href.trim() ? d.cta_label.trim() : "";
  const kinds = KINDS.some(([k]) => k === d.kind) ? KINDS : [...KINDS, [d.kind, KIND_LABEL[d.kind]] as [AnnouncementKind, string]];

  const set = <K extends keyof AnnouncementInput>(key: K, value: AnnouncementInput[K]) => {
    setD((f) => ({ ...f, [key]: value }));
    if (key in errors) setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const setWho = (who: Who) => {
    setD((f) => ({ ...f, audience: who as AnnouncementAudience }));
    setErrors((e) => ({ ...e, plan_codes: undefined, owner_emails: undefined }));
  };

  const save = async () => {
    const found = validate(d);
    setErrors(found);
    if (Object.keys(found).length) {
      window.setTimeout(() => document.getElementById(`pu-${Object.keys(found)[0]}`)?.focus(), 0);
      return;
    }
    setBusy(true);
    setError("");
    const payload: AnnouncementInput = {
      ...d,
      placement: "popup",
      title: d.title.trim(),
      body: d.body.trim(),
      // With a special price the server makes the button ("Upgrade for ₹…"): no link of our own.
      cta_label: withPrice ? "" : d.cta_label.trim(),
      cta_href: withPrice ? "" : d.cta_href.trim(),
      offer_plan: withPrice ? d.offer_plan : null,
      offer_price_inr: withPrice ? d.offer_price_inr : null,
      plan_codes: d.audience === "plans" ? d.plan_codes : [],
      owner_emails: d.audience === "owners" ? d.owner_emails : [],
    };
    try {
      const image = pictureChange(picture, Boolean(editing.savedPicture));
      const saved = isNew ? await createAnnouncement(payload, image) : await updateAnnouncement(editing.id as number, payload, image);
      onSaved(
        !isNew
          ? "Saved. Owners see the new version the next time it’s due."
          : saved.status === "scheduled"
            ? `Scheduled for ${fmt(saved.starts_at)}.`
            : "Live. Owners see it at their next login.",
      );
    } catch (e) {
      const fields = e instanceof ApiError ? e.fields : {};
      const atFields = Object.fromEntries(Object.entries(fields).filter(([k]) => FIELD_KEYS.includes(k)));
      if (Object.keys(atFields).length) setErrors(atFields as Partial<Record<FieldKey, string>>);
      setError(fields.image ?? fields.audience ?? fields.placement ?? (e instanceof Error ? e.message : "Couldn’t save it. Try again."));
      setBusy(false);
    }
  };

  const err = (k: FieldKey) =>
    errors[k] ? (
      <span className="an-err" id={`pu-${k}-error`}>
        {errors[k]}
      </span>
    ) : null;
  const fp = (k: FieldKey) => ({
    id: `pu-${k}`,
    "aria-invalid": errors[k] ? true : undefined,
    "aria-describedby": errors[k] ? `pu-${k}-error` : undefined,
  });

  return (
    <Modal
      title={isNew ? "New pop-up" : "Edit pop-up"}
      subtitle="What owners see over their dashboard. The preview is the real size."
      onClose={() => (busy ? undefined : onClose())}
      className="pu-dialog"
      footer={
        <>
          <button type="button" className="btn" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn dark" disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : isNew ? "Save pop-up" : "Save changes"}
          </button>
        </>
      }
    >
      <div className="pu-ed">
        <div className="pu-form">
          <div className="pu-fl">
            <span className="lab" id="pu-type-l">
              Type
            </span>
            <div className="seg" role="group" aria-labelledby="pu-type-l">
              {kinds.map(([k, label]) => (
                <button key={k} type="button" className={d.kind === k ? "on" : ""} aria-pressed={d.kind === k} onClick={() => set("kind", k)}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <PicturePicker edit={picture} savedUrl={editing.savedPicture} onChange={setPicture} hint="PNG, JPG or WebP, up to 2 MB. Shown on top, 2:1 (for example 880 × 440)." />

          <div className="pu-fl">
            <div className="pu-fl__row">
              <label className="lab" htmlFor="pu-title">
                Title
              </label>
              <span className="k num">{d.title.length} / 120</span>
            </div>
            <input className={"inp" + (errors.title ? " bad" : "")} maxLength={120} placeholder="Happy Diwali from all of us at Zinwe" value={d.title} onChange={(e) => set("title", e.target.value)} {...fp("title")} />
            {err("title")}
          </div>

          <div className="pu-fl">
            <div className="pu-fl__row">
              <label className="lab" htmlFor="pu-body">
                Text{" "}
                <span className="k" style={{ fontWeight: 400 }}>
                  · optional, one line
                </span>
              </label>
              <span className="k num">{d.body.length} / 280</span>
            </div>
            <textarea className="ta pu-ta" maxLength={280} placeholder="Your PCs stay protected while you celebrate." value={d.body} onChange={(e) => set("body", e.target.value)} {...fp("body")} />
          </div>

          {d.kind === "offer" || d.kind === "discount" ? (
            <fieldset className="pu-set">
              <legend className="lab">
                Special price{" "}
                <span className="k" style={{ fontWeight: 400 }}>
                  · optional, makes the button
                </span>
              </legend>
              <div className="pu-two">
                <select className="inp" aria-label="Special price plan" value={d.offer_plan ?? ""} onChange={(e) => set("offer_plan", e.target.value || null)} {...fp("offer_plan")}>
                  <option value="">No special price</option>
                  {paidPlans.map((p) => (
                    <option key={p.code} value={p.code}>
                      Upgrade to {p.name}
                    </option>
                  ))}
                </select>
                {withPrice ? (
                  <input
                    type="number"
                    min={1}
                    step="0.01"
                    inputMode="decimal"
                    aria-label="Price in ₹, before GST"
                    className={"inp" + (errors.offer_price_inr ? " bad" : "")}
                    placeholder="Price in ₹, before GST"
                    value={d.offer_price_inr ?? ""}
                    onChange={(e) => set("offer_price_inr", e.target.value || null)}
                    {...fp("offer_price_inr")}
                  />
                ) : null}
              </div>
              {err("offer_plan")}
              {err("offer_price_inr")}
              {withPrice ? <span className="k">One billing cycle, paid online, once per owner while it’s live. The button reads “{offerButton(d.offer_price_inr)}”.</span> : null}
            </fieldset>
          ) : null}

          {withPrice ? null : (
            <div className="pu-two">
              <div className="pu-fl">
                <label className="lab" htmlFor="pu-cta_label">
                  Button text{" "}
                  <span className="k" style={{ fontWeight: 400 }}>
                    · optional
                  </span>
                </label>
                <input className={"inp" + (errors.cta_label ? " bad" : "")} maxLength={40} placeholder="See what’s new" value={d.cta_label} onChange={(e) => set("cta_label", e.target.value)} {...fp("cta_label")} />
                {err("cta_label")}
              </div>
              <div className="pu-fl">
                <label className="lab" htmlFor="pu-cta_href">
                  Link
                </label>
                <input
                  className={"inp" + (errors.cta_href ? " bad" : "")}
                  maxLength={300}
                  placeholder="/app/whats-new or https://zinwe.io/…"
                  value={d.cta_href}
                  onChange={(e) => set("cta_href", e.target.value)}
                  onBlur={() => {
                    const bad = linkError(d.cta_href);
                    if (bad) setErrors((er) => ({ ...er, cta_href: bad }));
                  }}
                  {...fp("cta_href")}
                />
                {err("cta_href")}
              </div>
            </div>
          )}

          <div className="pu-two">
            <div className="pu-fl">
              <label className="lab" htmlFor="pu-start">
                Starts
              </label>
              <input id="pu-start" type="datetime-local" className="inp" value={toLocalInput(d.starts_at)} onChange={(e) => set("starts_at", fromLocalInput(e.target.value) ?? new Date().toISOString())} />
            </div>
            <div className="pu-fl">
              <label className="lab" htmlFor="pu-ends_at">
                Ends{" "}
                <span className="k" style={{ fontWeight: 400 }}>
                  · optional
                </span>
              </label>
              <input type="datetime-local" className={"inp" + (errors.ends_at ? " bad" : "")} value={toLocalInput(d.ends_at)} onChange={(e) => set("ends_at", fromLocalInput(e.target.value))} {...fp("ends_at")} />
              {err("ends_at")}
            </div>
          </div>

          <fieldset className="pu-set">
            <legend className="lab">Who sees it</legend>
            <div className="seg pu-who" role="group" aria-label="Who sees it">
              {WHO.map(([k, label]) => (
                <button key={k} type="button" className={d.audience === k ? "on" : ""} aria-pressed={d.audience === k} onClick={() => setWho(k)}>
                  {label}
                </button>
              ))}
            </div>
            {d.audience === "plans" ? (
              <div className="pu-plans" role="group" aria-label="Plans" id="pu-plan_codes" tabIndex={-1}>
                {plans.map((p) => {
                  const on = d.plan_codes.includes(p.code);
                  return (
                    <label key={p.code} className={"an-opt" + (on ? " on" : "")}>
                      <input type="checkbox" checked={on} onChange={() => set("plan_codes", on ? d.plan_codes.filter((c) => c !== p.code) : [...d.plan_codes, p.code])} />
                      {p.name}
                      {isPaidPlan(p) ? null : <span className="k">free</span>}
                    </label>
                  );
                })}
              </div>
            ) : null}
            {d.audience === "owners" ? <PeoplePicker emails={d.owner_emails} onChange={(list) => set("owner_emails", list)} invalid={Boolean(errors.owner_emails)} /> : null}
            {err("plan_codes")}
            {err("owner_emails")}
            <span className="pu-reach" role="status">
              Reaches <b className="num">{reach ? reach.customers : "…"}</b> {reach?.customers === 1 ? "owner" : "owners"} right now
            </span>
            {offerToPaid(d, plans) ? (
              <p className="pu-warn" role="alert">
                Paid plans never see offer pop-ups: only news, new versions, wishes and maintenance. Owners on a paid plan in this audience won’t see it.
              </p>
            ) : null}
          </fieldset>

          <label className="sw">
            <input type="checkbox" role="switch" checked={d.is_active} onChange={(e) => set("is_active", e.target.checked)} />
            <span className="tr" aria-hidden="true">
              <span />
            </span>
            {d.is_active ? "On: shows between the start and the end" : "Off: never shows"}
          </label>

          {error ? (
            <p className="err-box" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <section className="pu-pv" aria-label="Preview">
          <span className="lab">Preview</span>
          <div className="pu-pv__stage">
            <MomentPreview kind={d.kind} title={d.title} body={d.body} button={button} pictureSrc={pictureSrc} />
          </div>
          <p className="k pu-pv__rhythm">{RHYTHM}</p>
        </section>
      </div>
    </Modal>
  );
}

/** How many owners this pop-up reaches now (its kind counts: paid plans never get offers). */
function usePopupReach(d: AnnouncementInput): { customers: number; total: number } | null {
  const [reach, setReach] = useState<{ customers: number; total: number } | null>(null);
  const plans = d.audience === "plans" ? d.plan_codes.join(",") : "";
  const emails = d.audience === "owners" ? d.owner_emails.join(",") : "";
  useEffect(() => {
    let alive = true;
    const timer = window.setTimeout(() => {
      getPopupReach(d.kind, d.audience, plans ? plans.split(",") : [], emails ? emails.split(",") : [])
        .then((r) => alive && setReach(r))
        .catch(() => alive && setReach(null));
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [d.kind, d.audience, plans, emails]);
  return reach;
}

/** Specific people: search owners by email, name or company and add them as chips (their sign-in emails). */
function PeoplePicker({ emails, onChange, invalid }: { emails: string[]; onChange: (list: string[]) => void; invalid: boolean }): ReactElement {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<OwnerHit[]>([]);
  const [known, setKnown] = useState<Record<string, OwnerHit>>({});
  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) {
      setHits([]);
      return;
    }
    let alive = true;
    const timer = window.setTimeout(() => {
      searchOwners(text)
        .then((r) => alive && setHits(r))
        .catch(() => alive && setHits([]));
    }, 200);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [q]);

  const add = (hit: OwnerHit) => {
    setKnown((k) => ({ ...k, [hit.email.toLowerCase()]: hit }));
    onChange(Array.from(new Set([...emails, hit.email.toLowerCase()])));
    setQ("");
    setHits([]);
  };
  const shown = hits.filter((h) => !emails.includes(h.email.toLowerCase()));

  return (
    <div className="pu-people">
      <label className="sr" htmlFor="pu-owner_emails">
        Search owners by email, name or company
      </label>
      <input
        id="pu-owner_emails"
        className={"inp" + (invalid ? " bad" : "")}
        placeholder="Search by email, name or company"
        autoComplete="off"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (shown[0]) add(shown[0]);
          }
        }}
      />
      {shown.length ? (
        <ul className="pu-hits" aria-label="Owners found">
          {shown.map((h) => (
            <li key={h.id}>
              <button type="button" onClick={() => add(h)}>
                <b>{h.company || h.full_name || h.email}</b>
                <span className="k">
                  {h.email}
                  {h.plan ? ` · ${h.plan}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : q.trim().length >= 2 ? (
        <span className="k">No owner matches “{q.trim()}”.</span>
      ) : null}
      {emails.length ? (
        <div className="an-chips">
          {emails.map((e) => {
            const who = known[e];
            const name = who ? who.company || who.full_name : "";
            return (
              <span key={e} className="an-chip">
                {name ? `${name} · ${e}` : e}
                <button type="button" className="an-chip__x" aria-label={`Remove ${name || e}`} onClick={() => onChange(emails.filter((x) => x !== e))}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                    <path d="M7 7l10 10M17 7L7 17" />
                  </svg>
                </button>
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

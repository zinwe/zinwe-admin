import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { useSearchParams } from "react-router-dom";
import { deleteAnnouncement, getInteractions, getPlans, updateAnnouncement, type Announcement, type InteractionTotals } from "../lib/api";
import { titleCase } from "../lib/format";
import { useLoad } from "../lib/useLoad";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { NO_PICTURE_EDIT } from "../components/PicturePicker";
import { PageHeader } from "../components/PageHeader";
import { Popover } from "../components/Popover";
import { EmptyState, ErrorState, LoadingState } from "../components/States";
import { Icon } from "../components/icons";
import { useToast } from "../components/Toast";
import { InteractionEditor, type Editing } from "./interactions/InteractionEditor";
import {
  KIND_PARAM,
  PARAM_OF,
  UI_KIND_LABEL,
  UI_KIND_PLURAL,
  avgOf,
  emptyDraft,
  oftenLabel,
  resultOf,
  shownOf,
  statusOf,
  toDraft,
  uiKindOf,
  whenLabel,
  whoLabel,
  type UiKind,
} from "./interactions/model";
import "../styles/announcements.css";
import "../styles/interactions.css";

const FILTERS: UiKind[] = ["offer", "feedback", "upgrade", "wish", "popup", "announce"];
type StateFilter = "all" | "now" | "live" | "scheduled" | "off" | "ended";
const STATE_FILTERS: [StateFilter, string][] = [
  ["now", "Live, scheduled and off"],
  ["live", "Live"],
  ["scheduled", "Scheduled"],
  ["off", "Paused and drafts"],
  ["ended", "Ended"],
  ["all", "All"],
];

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

/** The tiles add up the rows when an older server sends no totals. */
function totalsOf(rows: Announcement[], totals: InteractionTotals | null): InteractionTotals {
  if (totals) return totals;
  const fb = rows.reduce((a, r) => a + (r.stats?.feedback_count ?? 0), 0);
  const weighted = rows.reduce((a, r) => a + (r.stats?.feedback_count ?? 0) * (avgOf(r.stats?.feedback_avg) ?? 0), 0);
  return {
    live: rows.filter((r) => r.status === "live").length,
    scheduled: rows.filter((r) => r.status === "scheduled").length,
    paused: rows.filter((r) => r.status === "off").length,
    shown_this_month: rows.reduce((a, r) => a + shownOf(r.stats), 0),
    feedback_count: fb,
    feedback_avg: fb ? weighted / fb : null,
    paid_after: rows.reduce((a, r) => a + (r.stats?.paid_after ?? 0), 0),
  };
}

/**
 * User interactions (F-22, board LabV135AdminInteractions): offers, feedback asks, upgrade asks, wishes, pop-ups and
 * announcement bars in one list with their numbers, and the 4-step editor. Pop-ups and Announcements moved here from
 * Publish; /popups and /announcements open this page filtered.
 */
export function InteractionsPage(): ReactElement {
  const load = useCallback(() => getInteractions(), []);
  const { data, error, pending, reload } = useLoad(load);
  const loadPlans = useCallback(() => getPlans(), []);
  const plans = useLoad(loadPlans);
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<Announcement | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ row: Announcement; anchor: HTMLElement } | null>(null);

  const kind: UiKind | null = KIND_PARAM[params.get("kind") ?? ""] ?? null;
  const stateFilter: StateFilter = (STATE_FILTERS.find(([k]) => k === params.get("state"))?.[0] ?? "now") as StateFilter;
  const editParam = params.get("edit");
  const planList = useMemo(() => plans.data ?? [], [plans.data]);
  const planName = (code: string) => planList.find((p) => p.code === code)?.name ?? titleCase(code);
  const all = useMemo(() => data?.rows ?? [], [data]);

  const setParam = useCallback(
    (key: string, value: string | null) => {
      setParams(
        (p) => {
          const next = new URLSearchParams(p);
          if (value === null) next.delete(key);
          else next.set(key, value);
          return next;
        },
        { replace: key !== "edit" },
      );
    },
    [setParams],
  );

  const open = (e: Editing) => {
    setEditing(e);
    setParam("edit", String(e.id));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const close = () => {
    setEditing(null);
    setParam("edit", null);
  };

  // Deep links (?edit=12 or ?edit=new) and the browser's Back button.
  useEffect(() => {
    if (!editParam) {
      setEditing(null);
      return;
    }
    if (editing && String(editing.id) === editParam) return;
    if (editParam === "new") {
      setEditing({ id: "new", draft: emptyDraft(kind ?? "popup"), savedPicture: null, picture: NO_PICTURE_EDIT });
      return;
    }
    if (!data) return;
    const row = all.find((a) => String(a.id) === editParam);
    if (row) setEditing({ id: row.id, draft: toDraft(row), savedPicture: row.image_url, picture: NO_PICTURE_EDIT });
    else {
      toast("That interaction isn’t here any more.", "bad");
      setParam("edit", null);
    }
  }, [editParam, data]);

  const inState = useMemo(
    () => all.filter((a) => (stateFilter === "all" ? true : stateFilter === "now" ? a.status !== "ended" : a.status === stateFilter)),
    [all, stateFilter],
  );
  const counts = useMemo(() => {
    const c: Record<UiKind, number> = { offer: 0, feedback: 0, upgrade: 0, wish: 0, popup: 0, announce: 0 };
    inState.forEach((a) => {
      c[uiKindOf(a)] += 1;
    });
    return c;
  }, [inState]);
  const rows = inState.filter((a) => !kind || uiKindOf(a) === kind);

  const t = totalsOf(all, data?.totals ?? null);
  const avg = avgOf(t.feedback_avg);
  const tiles = [
    { label: "Live now", value: String(t.live), note: `${t.scheduled} more scheduled, ${t.paused} paused or draft` },
    { label: "Shown this month", value: String(t.shown_this_month), note: "Owners shown an interaction" },
    { label: "Feedback from asks", value: String(t.feedback_count), note: avg !== null ? `Average ${avg.toFixed(1)} out of 10` : "No answers yet" },
    { label: "Paid after an ask", value: String(t.paid_after), note: "Paid within 7 days of a click" },
  ];

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
    open({
      id: "new",
      draft: { ...toDraft(a), starts_at: new Date().toISOString(), ends_at: null, is_active: true },
      savedPicture: null,
      picture: file ? { file, removed: false } : NO_PICTURE_EDIT,
    });
  };

  const startNew = () => open({ id: "new", draft: emptyDraft(kind ?? "popup"), savedPicture: null, picture: NO_PICTURE_EDIT });

  return (
    <>
      <PageHeader
        title="User interactions"
        subtitle="Offers, feedback asks, upgrade asks and wishes that show in the dashboard at the right moment. Pop-ups and announcements moved here from Publish; their old links open this page."
        onReload={editing ? undefined : reload}
        pending={pending}
      >
        {editing ? null : (
          <button type="button" className="btn dark" onClick={startNew}>
            <Icon name="plus" />
            New interaction
          </button>
        )}
      </PageHeader>

      {editing ? (
        <InteractionEditor
          key={`${editing.id}-${editing.draft.starts_at}`}
          editing={editing}
          plans={planList}
          onCancel={close}
          onSaved={(msg) => {
            close();
            toast(msg);
            reload();
          }}
        />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <LoadingState rows={5} label="Loading interactions…" />
      ) : (
        <>
          <div className="ix-tiles">
            {tiles.map((x) => (
              <div key={x.label} className="tile ix-tile">
                <span className="ix-tile__label">{x.label}</span>
                <span className="ix-tile__value num">{x.value}</span>
                <span className="k">{x.note}</span>
              </div>
            ))}
          </div>

          <div className="ix-bar">
            <div className="ix-chips" role="group" aria-label="Kind">
              <button type="button" className={"chip" + (kind ? "" : " on")} aria-pressed={!kind} onClick={() => setParam("kind", null)}>
                All · <span className="n">{inState.length}</span>
              </button>
              {FILTERS.map((k) => (
                <button key={k} type="button" className={"chip" + (kind === k ? " on" : "")} aria-pressed={kind === k} onClick={() => setParam("kind", PARAM_OF[k])}>
                  {UI_KIND_PLURAL[k]} · <span className="n">{counts[k]}</span>
                </button>
              ))}
            </div>
            <label className="sr" htmlFor="ix-state">
              Show
            </label>
            <select id="ix-state" className="inp ix-state" value={stateFilter} onChange={(e) => setParam("state", e.target.value === "now" ? null : e.target.value)}>
              {STATE_FILTERS.map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {all.length === 0 ? (
            <div className="card">
              <EmptyState
                icon="interactions"
                title="No interactions yet"
                body="Make an offer with a coupon, a feedback ask on sign-out, a wish for a festival, a pop-up or an announcement bar."
                action={
                  <button type="button" className="btn dark" onClick={startNew}>
                    New interaction
                  </button>
                }
              />
            </div>
          ) : rows.length === 0 ? (
            <div className="card">
              <EmptyState
                icon="filter"
                title="Nothing matches"
                body={`No ${kind ? UI_KIND_PLURAL[kind].toLowerCase() : "interactions"} in “${STATE_FILTERS.find(([k]) => k === stateFilter)?.[1]}”.`}
                action={
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setParam("kind", null);
                      setParam("state", "all");
                    }}
                  >
                    Show everything
                  </button>
                }
              />
            </div>
          ) : (
            <section className="card ix-list" aria-label="Interactions">
              <div className="tbl-wrap">
                <table className="tbl ix-tbl">
                  <thead>
                    <tr>
                      <th scope="col">Interaction</th>
                      <th scope="col">When</th>
                      <th scope="col">Who</th>
                      <th scope="col">How often</th>
                      <th scope="col" className="r">
                        Shown
                      </th>
                      <th scope="col">Result</th>
                      <th scope="col">Status</th>
                      <th scope="col">
                        <span className="sr">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((a) => {
                      const ui = uiKindOf(a);
                      const st = statusOf(a);
                      const res = resultOf(a);
                      const shown = shownOf(a.stats);
                      return (
                        <tr key={a.id}>
                          <th scope="row">
                            <span className="ix-name">{a.title}</span>
                            <span className={"pill " + (ui === "offer" ? "accent" : "muted")}>{UI_KIND_LABEL[ui]}</span>
                          </th>
                          <td>{whenLabel(a)}</td>
                          <td>{whoLabel(a, planName)}</td>
                          <td className="ix-often">{oftenLabel(a)}</td>
                          <td className="r num">{shown ? shown : "—"}</td>
                          <td>
                            <span className="ix-res">{res.result}</span>
                            <span className="k ix-res__note">{res.note}</span>
                          </td>
                          <td>
                            <span className={`pill ${st[1]}`}>{st[0]}</span>
                          </td>
                          <td>
                            <div className="ix-acts">
                              <button
                                type="button"
                                className="btn sm"
                                aria-label={`Edit ${a.title}`}
                                onClick={() => open({ id: a.id, draft: toDraft(a), savedPicture: a.image_url, picture: NO_PICTURE_EDIT })}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="btn sm ix-more"
                                aria-label={`More for ${a.title}`}
                                aria-haspopup="dialog"
                                disabled={busy === a.id}
                                onClick={(e) => setMenu({ row: a, anchor: e.currentTarget })}
                              >
                                ⋯
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
          )}
          <p className="k ix-foot">
            Result is clicks for offers, pop-ups and upgrade asks, feedback sent for feedback asks, closes for announcements. The tiles add up
            the rows. Feedback lands in Inbox → Feedback with the interaction’s name. Owners only, never employees, and at most one interaction
            a day (bars aside).
          </p>
        </>
      )}

      {menu ? (
        <Popover anchor={menu.anchor} title={menu.row.title} width={240} onClose={() => setMenu(null)}>
          <div className="ix-menu">
            <button
              type="button"
              onClick={() => {
                const row = menu.row;
                setMenu(null);
                void toggle(row);
              }}
            >
              {menu.row.is_active ? "Turn off" : "Turn on"}
            </button>
            <button
              type="button"
              onClick={() => {
                const row = menu.row;
                setMenu(null);
                void duplicate(row);
              }}
            >
              Duplicate
            </button>
            <button
              type="button"
              className="is-bad"
              onClick={() => {
                const row = menu.row;
                setMenu(null);
                setDeleting(row);
              }}
            >
              {menu.row.status === "scheduled" ? "Cancel it" : "Delete"}
            </button>
          </div>
        </Popover>
      ) : null}

      {deleting ? (
        <ConfirmDialog
          title={deleting.status === "scheduled" ? `Cancel “${deleting.title}”?` : `Delete “${deleting.title}”?`}
          confirmLabel={deleting.status === "scheduled" ? "Cancel it" : "Delete"}
          danger
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            const wasScheduled = deleting.status === "scheduled";
            await deleteAnnouncement(deleting.id);
            setDeleting(null);
            toast(wasScheduled ? "Cancelled. It will not be shown." : "Deleted.");
            reload();
          }}
        >
          <p>
            {deleting.status === "scheduled"
              ? "It will not be shown to anyone. This can’t be undone."
              : "It stops showing at once and its numbers and picture are removed. This can’t be undone. To keep the numbers, turn it off instead."}
          </p>
        </ConfirmDialog>
      ) : null}
    </>
  );
}

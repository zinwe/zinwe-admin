import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../lib/api";
import {
  CHANNEL_LABEL,
  CODE_RE,
  couponDay as dayMon,
  couponRange as validRange,
  createCoupon,
  firstMonth,
  getCouponUses,
  getCoupons,
  suggestCoupon,
  updateCoupon,
  type Coupon,
  type CouponChannel,
  type CouponInput,
  type CouponPlan,
  type CouponStatus,
  type CouponUse,
} from "../lib/couponsApi";
import { money } from "../lib/format";
import { useLoad } from "../lib/useLoad";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { PageHeader } from "../components/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "../components/States";
import { Icon, PathIcon } from "../components/icons";
import { useToast } from "../components/Toast";
import "../styles/coupons.css";

/* ---------- Vocabulary and dates ---------- */

const STATUS: Record<CouponStatus, [string, string]> = {
  live: ["Live", "good"],
  scheduled: ["Scheduled", "info"],
  ended: ["Ended", "muted"],
  paused: ["Paused", "warn"],
  cancelled: ["Cancelled", "muted"],
};
const CHANNELS: CouponChannel[] = ["whatsapp", "email", "popup", "other"];

/** Today in India as "2026-12-18" (coupon dates are IST days). */
function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}
function paidOn(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}
const paidPlans = (plans: CouponPlan[]) => plans.filter((p) => Number(p.price_inr_monthly) > 0);

function planNames(codes: string[], plans: CouponPlan[]): string {
  const paid = paidPlans(plans);
  if (!codes.length || (paid.length > 0 && paid.every((p) => codes.includes(p.code)))) return "Any plan";
  return codes.map((c) => plans.find((p) => p.code === c)?.name ?? c).join(", ");
}

function source(c: Coupon): string {
  return [CHANNEL_LABEL[c.channel] ?? c.channel, c.campaign].filter(Boolean).join(" · ");
}

/* ---------- Page ---------- */

type View = { kind: "list" } | { kind: "new"; from: Coupon | null } | { kind: "edit"; coupon: Coupon };

/**
 * Coupons (F-21, board LabV135AdminCoupons): codes for WhatsApp, email and pop-up offers and which ones bring paying
 * customers. A code takes exactly its own % (at most 40%) off today's price, first month of monthly billing only; the
 * plan prices themselves never change. One code per company, ever.
 */
export function CouponsPage(): ReactElement {
  const load = useCallback(() => getCoupons(), []);
  const { data, error, pending, reload } = useLoad(load);
  const toast = useToast();
  const [view, setView] = useState<View>({ kind: "list" });
  const [pickId, setPickId] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState<Coupon | null>(null);

  const coupons = useMemo(() => data?.coupons ?? [], [data]);
  const plans = useMemo(() => data?.plans ?? [], [data]);
  const picked = pickId !== null ? (coupons.find((c) => c.id === pickId) ?? null) : null;
  const isForm = view.kind !== "list";

  const patch = async (c: Coupon, body: { paused?: boolean; cancelled?: boolean }, done: string) => {
    setBusy(c.id);
    try {
      await updateCoupon(c.id, body);
      toast(done);
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn’t change that.", "bad");
    } finally {
      setBusy(null);
    }
  };

  const second = (c: Coupon): { label: string; run: () => void } => {
    if (c.status === "live") return { label: "Pause", run: () => void patch(c, { paused: true }, `${c.code} is paused. Customers see “This code is paused”.`) };
    if (c.status === "paused") return { label: "Turn on", run: () => void patch(c, { paused: false }, `${c.code} works again.`) };
    if (c.status === "scheduled") return { label: "Cancel", run: () => setCancelling(c) };
    return { label: "Copy", run: () => setView({ kind: "new", from: c }) };
  };

  const t = data?.totals;
  const live = coupons.filter((c) => c.status === "live");
  const soonest = live.map((c) => c.ends_on).filter((d): d is string => Boolean(d)).sort()[0];
  const best = t?.best ?? null;
  const tiles = t
    ? [
        { label: "Live now", value: String(t.live), note: t.live ? (soonest ? `The first one ends ${dayMon(soonest)}` : "No end date") : "No code is live" },
        { label: "Used so far", value: String(t.uses), note: t.uses === 1 ? "1 company used a code" : `${t.uses} companies used a code` },
        { label: "Paid with a code", value: money(t.paid_inr), note: "First payments, before GST" },
        {
          label: "Best code",
          value: best ? best.code : "—",
          note: best ? [`${best.uses} ${best.uses === 1 ? "use" : "uses"}`, CHANNEL_LABEL[best.channel], best.campaign].filter(Boolean).join(" · ") : "No code used yet",
        },
      ]
    : [];

  return (
    <>
      <PageHeader
        title="Coupons"
        subtitle="Codes for WhatsApp, email and pop-up offers. A code takes its % off today's price, for the first month of monthly billing only."
        onReload={isForm ? undefined : reload}
        pending={pending}
      >
        <button type="button" className="btn dark" onClick={() => setView({ kind: "new", from: null })}>
          <Icon name="plus" />
          New code
        </button>
      </PageHeader>

      <div className="tabs-row cp-tabs" role="tablist" aria-label="Coupons">
        <button type="button" role="tab" aria-selected={!isForm} className={"tab" + (isForm ? "" : " on")} onClick={() => setView({ kind: "list" })}>
          Codes{data ? ` · ${coupons.length}` : ""}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={isForm}
          className={"tab" + (isForm ? " on" : "")}
          onClick={() => (isForm ? undefined : setView({ kind: "new", from: null }))}
        >
          {view.kind === "edit" ? `Edit ${view.coupon.code}` : "New code"}
        </button>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <LoadingState rows={5} label="Loading coupons…" />
      ) : isForm ? (
        <CouponForm
          key={view.kind === "edit" ? `e${view.coupon.id}` : `n${view.from?.id ?? 0}`}
          view={view}
          plans={plans}
          coupons={coupons}
          onCancel={() => setView({ kind: "list" })}
          onSaved={(msg) => {
            setView({ kind: "list" });
            toast(msg);
            reload();
          }}
        />
      ) : (
        <>
          <div className="cp-tiles">
            {tiles.map((x) => (
              <div key={x.label} className="tile cp-tile">
                <span className="cp-tile__label">{x.label}</span>
                <span className={"cp-tile__value num" + (x.label === "Best code" && best ? " mono" : "")}>{x.value}</span>
                <span className="k">{x.note}</span>
              </div>
            ))}
          </div>

          <div className="cp-main">
            <div className="cp-col">
              {coupons.length === 0 ? (
                <div className="card">
                  <EmptyState
                    icon="coupon"
                    title="No codes yet"
                    body="Make a code for a WhatsApp message, an email or a pop-up offer. It takes its % off the first month."
                    action={
                      <button type="button" className="btn dark" onClick={() => setView({ kind: "new", from: null })}>
                        New code
                      </button>
                    }
                  />
                </div>
              ) : (
                <section className="card cp-list" aria-label="Coupon codes">
                  <div className="tbl-wrap">
                    <table className="tbl cp-tbl">
                      <thead>
                        <tr>
                          <th scope="col">Code</th>
                          <th scope="col">Plans</th>
                          <th scope="col">Off</th>
                          <th scope="col">Valid</th>
                          <th scope="col">Used</th>
                          <th scope="col" className="r">
                            Paid with it
                          </th>
                          <th scope="col">Status</th>
                          <th scope="col" className="r">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {coupons.map((c) => {
                          const st = STATUS[c.status] ?? [c.status, "muted"];
                          const act = second(c);
                          const on = pickId === c.id;
                          const pct = c.max_uses ? Math.min(100, Math.max(2, Math.round((c.uses / c.max_uses) * 100))) : 0;
                          return (
                            <tr key={c.id} className={on ? "is-picked" : ""}>
                              <th scope="row">
                                <button
                                  type="button"
                                  className="cp-code mono"
                                  aria-pressed={on}
                                  aria-label={`See the companies that used ${c.code}`}
                                  onClick={() => setPickId(on ? null : c.id)}
                                >
                                  {c.code}
                                </button>
                                <span className="k cp-src">{source(c)}</span>
                              </th>
                              <td>{planNames(c.plan_codes, plans)}</td>
                              <td style={{ fontWeight: 600 }} className="num">
                                {c.percent_off}%
                              </td>
                              <td className="num" style={{ whiteSpace: "nowrap" }}>
                                {validRange(c.starts_on, c.ends_on)}
                              </td>
                              <td>
                                <span className="num cp-used">{c.max_uses ? `${c.uses} of ${c.max_uses}` : `${c.uses} · no limit`}</span>
                                {c.max_uses ? (
                                  <span className="cp-bar" aria-hidden="true">
                                    <span style={{ width: `${pct}%` }} />
                                  </span>
                                ) : null}
                              </td>
                              <td className="r num" style={{ fontWeight: 600 }}>
                                {money(c.paid_inr)}
                              </td>
                              <td>
                                <span className={`pill ${st[1]}`}>{st[0]}</span>
                              </td>
                              <td>
                                <div className="cp-acts">
                                  <button type="button" className="btn sm" aria-label={`Edit ${c.code}`} onClick={() => setView({ kind: "edit", coupon: c })}>
                                    Edit
                                  </button>
                                  <button type="button" className="btn sm" disabled={busy === c.id} onClick={act.run}>
                                    {act.label}
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
              <p className="k cp-foot">
                “Paid with it” is the money received from first payments that used the code, before GST. Click a code to see the
                companies that used it.
              </p>
              <div className="cp-floor">
                <span>
                  A code takes exactly its own % off today’s price, at most 40%, for the first month of monthly billing. Plan
                  prices stay as they are.
                </span>
              </div>
            </div>

            {picked ? <UsedPanel coupon={picked} plans={plans} onClose={() => setPickId(null)} /> : null}
          </div>
        </>
      )}

      {cancelling ? (
        <ConfirmDialog
          title={`Cancel ${cancelling.code}?`}
          confirmLabel="Cancel the code"
          danger
          onClose={() => setCancelling(null)}
          onConfirm={async () => {
            await updateCoupon(cancelling.id, { cancelled: true });
            setCancelling(null);
            toast(`${cancelling.code} is cancelled. Nobody can use it.`);
            reload();
          }}
        >
          <p>Nobody can use it after this. It stays in the list with its numbers, and its code can’t be used again.</p>
        </ConfirmDialog>
      ) : null}
    </>
  );
}

/* ---------- Who used a code ---------- */

const USE_STATE: Record<CouponUse["state"], string> = { pending: "payment being checked", confirmed: "paid", void: "not paid" };

function UsedPanel({ coupon, plans, onClose }: { coupon: Coupon; plans: CouponPlan[]; onClose: () => void }): ReactElement {
  const load = useCallback(() => getCouponUses(coupon.id), [coupon.id]);
  const { data, error, reload } = useLoad(load);
  const uses = data?.uses ?? [];
  const summary = coupon.uses
    ? `${coupon.uses} ${coupon.uses === 1 ? "company" : "companies"} · ${money(coupon.paid_inr)} paid with it`
    : `${planNames(coupon.plan_codes, plans)} · ${(STATUS[coupon.status]?.[0] ?? coupon.status).toLowerCase()}`;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <aside className="card cp-used-panel" aria-label={`Companies that used ${coupon.code}`}>
      <header className="cp-up__head">
        <span className="cp-up__title">
          <span className="mono cp-up__code">{coupon.code}</span>
          <span className="k">{summary}</span>
        </span>
        <button type="button" className="ibtn" aria-label="Close" onClick={onClose}>
          <Icon name="close" />
        </button>
      </header>
      {error ? (
        <div style={{ padding: 12 }}>
          <ErrorState message={error} onRetry={reload} title="Couldn’t load who used it" />
        </div>
      ) : !data ? (
        <LoadingState rows={3} bare label="Loading the companies…" />
      ) : uses.length === 0 ? (
        <p className="k cp-up__none">No company has used this code yet.</p>
      ) : (
        <ul className="cp-up__list">
          {uses.map((u, i) => (
            <li key={`${u.owner_email}-${i}`} className={u.state === "void" ? "is-void" : ""}>
              <span className="cp-up__who">
                {u.subscriber_id ? (
                  <Link to={`/subscribers?open=${u.subscriber_id}`} className="cp-up__co">
                    {u.company || u.owner_email}
                  </Link>
                ) : (
                  <b>{u.company || u.owner_email}</b>
                )}
                <span className="k">
                  {u.plan_name} · {u.cycle} · {u.state === "confirmed" ? `paid ${paidOn(u.created_at)}` : `${USE_STATE[u.state]} · ${paidOn(u.created_at)}`}
                </span>
              </span>
              <span className="num cp-up__amt">{money(u.amount_inr)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="k cp-up__foot">Before GST. Each company opens its page in Subscribers.</p>
    </aside>
  );
}

/* ---------- New / edit ---------- */

type FormErrors = Partial<Record<"code" | "percent_off" | "max_uses" | "starts_on" | "ends_on" | "plan_codes" | "channel" | "campaign", string>>;
const FORM_KEYS = ["code", "percent_off", "max_uses", "starts_on", "ends_on", "plan_codes", "channel", "campaign"];

interface Draft {
  code: string;
  pct: string;
  limit: string;
  from: string;
  to: string;
  plans: string[];
  channel: CouponChannel;
  campaign: string;
}

function draftOf(view: Exclude<View, { kind: "list" }>): Draft {
  const today = todayIST();
  if (view.kind === "edit") {
    const c = view.coupon;
    return {
      code: c.code,
      pct: String(c.percent_off),
      limit: c.max_uses === null ? "" : String(c.max_uses),
      from: c.starts_on,
      to: c.ends_on ?? "",
      plans: c.plan_codes,
      channel: c.channel,
      campaign: c.campaign,
    };
  }
  const f = view.from;
  return {
    code: "",
    pct: f ? String(f.percent_off) : "20",
    limit: f ? (f.max_uses === null ? "" : String(f.max_uses)) : "100",
    from: today,
    to: addDays(today, 29),
    plans: f ? f.plan_codes : [],
    channel: f ? f.channel : "whatsapp",
    campaign: f ? (f.campaign ? `${f.campaign} (copy)` : "") : "",
  };
}

function check(d: Draft, codeLocked: boolean): FormErrors {
  const e: FormErrors = {};
  if (!codeLocked && !CODE_RE.test(d.code)) e.code = `${d.code.length} of 11. A code needs exactly 11 capital letters or numbers.`;
  const pct = Number(d.pct);
  if (!/^\d+$/.test(d.pct.trim()) || pct < 1 || pct > 40) e.percent_off = "A whole number from 1 to 40.";
  if (d.limit.trim() && (!/^\d+$/.test(d.limit.trim()) || Number(d.limit) < 1)) e.max_uses = "A whole number, 1 or more, or leave it empty.";
  if (!d.from) e.starts_on = "Pick the first day.";
  if (d.to && d.from && d.to < d.from) e.ends_on = "The last day can’t be before the first day.";
  return e;
}

function CouponForm({
  view,
  plans,
  coupons,
  onCancel,
  onSaved,
}: {
  view: Exclude<View, { kind: "list" }>;
  plans: CouponPlan[];
  coupons: Coupon[];
  onCancel: () => void;
  onSaved: (message: string) => void;
}): ReactElement {
  const isNew = view.kind === "new";
  const editing = view.kind === "edit" ? view.coupon : null;
  const codeLocked = Boolean(editing && editing.uses > 0);
  const [d, setD] = useState<Draft>(() => draftOf(view));
  const [errors, setErrors] = useState<FormErrors>({});
  const [busy, setBusy] = useState(false);
  const [making, setMaking] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();
  const paid = paidPlans(plans);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setD((f) => ({ ...f, [key]: value }));
    const map: Record<keyof Draft, keyof FormErrors> = { code: "code", pct: "percent_off", limit: "max_uses", from: "starts_on", to: "ends_on", plans: "plan_codes", channel: "channel", campaign: "campaign" };
    setErrors((e) => ({ ...e, [map[key]]: undefined }));
  };

  const makeOne = useCallback(async () => {
    setMaking(true);
    try {
      const r = await suggestCoupon();
      setD((f) => ({ ...f, code: r.code }));
      setErrors((e) => ({ ...e, code: undefined }));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn’t make a code. Type one instead.", "bad");
    } finally {
      setMaking(false);
    }
  }, [toast]);

  // A copy of an ended code starts with a fresh code of its own.
  useEffect(() => {
    if (isNew && view.from) void makeOne();
  }, [isNew, view, makeOne]);

  const taken = !codeLocked && CODE_RE.test(d.code) && coupons.some((c) => c.code === d.code && c.id !== editing?.id);
  const codeOk = CODE_RE.test(d.code) && !taken;
  const codeHelp = errors.code
    ? errors.code
    : codeLocked
      ? "The code cannot change once a company has used it."
      : taken
        ? "Another code already has these letters. Change one or press Make one."
        : codeOk
          ? isNew
            ? "11 of 11 letters and numbers. Nobody else has this code."
            : "11 of 11 letters and numbers. It can change until a company uses it."
          : `${d.code.length} of 11. A code needs exactly 11 capital letters or numbers.`;
  const codeTone = errors.code || taken || (!codeOk && d.code.length > 0) ? "bad" : codeOk && isNew ? "good" : "";

  const save = async () => {
    const found = check(d, codeLocked);
    if (taken) found.code = "Another code already has these letters.";
    setErrors(found);
    if (Object.keys(found).length) {
      window.setTimeout(() => document.getElementById(`cp-${Object.keys(found)[0]}`)?.focus(), 0);
      return;
    }
    setBusy(true);
    setError("");
    const body: CouponInput = {
      code: d.code,
      percent_off: Number(d.pct),
      plan_codes: d.plans,
      starts_on: d.from,
      ends_on: d.to || null,
      max_uses: d.limit.trim() ? Number(d.limit) : null,
      channel: d.channel,
      campaign: d.campaign.trim(),
    };
    try {
      if (editing) {
        const { code, ...rest } = body;
        await updateCoupon(editing.id, codeLocked || code === editing.code ? rest : body);
        onSaved(`${body.code} saved.`);
      } else {
        const saved = await createCoupon(body);
        onSaved(saved.status === "scheduled" ? `${saved.code} saved. It starts on ${dayMon(saved.starts_on)}.` : `${saved.code} saved. Customers can use it now.`);
      }
    } catch (e) {
      const fields = e instanceof ApiError ? e.fields : {};
      const at = Object.fromEntries(Object.entries(fields).filter(([k]) => FORM_KEYS.includes(k))) as FormErrors;
      if (Object.keys(at).length) setErrors(at);
      const rest = Object.entries(fields).filter(([k]) => !FORM_KEYS.includes(k));
      setError(Object.keys(at).length && !rest.length ? "" : (rest[0]?.[1] ?? (e instanceof Error ? e.message : "Couldn’t save it. Try again.")));
      setBusy(false);
    }
  };

  const fp = (k: keyof FormErrors) => ({
    id: `cp-${k}`,
    "aria-invalid": errors[k] ? true : undefined,
    "aria-describedby": errors[k] ? `cp-${k}-error` : undefined,
  });
  const err = (k: keyof FormErrors) =>
    errors[k] ? (
      <span className="field-err" id={`cp-${k}-error`}>
        {errors[k]}
      </span>
    ) : null;

  const pct = Math.min(40, Math.max(0, Number(d.pct) || 0));
  const previewPlans = (d.plans.length ? paid.filter((p) => d.plans.includes(p.code)) : paid).map((p) => ({ p, r: firstMonth(p, pct) }));
  const title = isNew ? (view.from ? `New code from ${view.from.code}` : "New code") : `Edit ${editing?.code}`;

  return (
    <div className="cp-form-wrap">
      <form
        className="card cp-form"
        aria-label={title}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <h2 className="cp-form__title">{title}</h2>

        <div className="cp-fl">
          <label className="lab" htmlFor="cp-code">
            Code
          </label>
          <div className="cp-coderow">
            <input
              className={"inp mono cp-code-inp" + (codeTone === "bad" ? " bad" : "")}
              maxLength={11}
              autoComplete="off"
              spellCheck={false}
              readOnly={codeLocked}
              value={d.code}
              onChange={(e) => set("code", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              {...fp("code")}
              aria-describedby="cp-code-help"
            />
            {isNew ? (
              <button type="button" className="btn" disabled={making} onClick={() => void makeOne()}>
                {making ? "Making…" : "Make one"}
              </button>
            ) : null}
          </div>
          <span id="cp-code-help" className={"cp-help" + (codeTone ? ` is-${codeTone}` : "")}>
            {codeHelp}
          </span>
        </div>

        <div className="cp-two">
          <div className="cp-fl">
            <label className="lab" htmlFor="cp-percent_off">
              % off
            </label>
            <input className={"inp" + (errors.percent_off ? " bad" : "")} inputMode="numeric" type="number" min={1} max={40} step={1} value={d.pct} onChange={(e) => set("pct", e.target.value)} {...fp("percent_off")} />
            {err("percent_off") ?? <span className="k">Up to 40%. First month of monthly billing only.</span>}
          </div>
          <div className="cp-fl">
            <label className="lab" htmlFor="cp-max_uses">
              Uses limit
            </label>
            <input className={"inp" + (errors.max_uses ? " bad" : "")} inputMode="numeric" type="number" min={1} step={1} value={d.limit} placeholder="No limit" onChange={(e) => set("limit", e.target.value)} {...fp("max_uses")} />
            {err("max_uses") ?? <span className="k">Leave empty for no limit.</span>}
          </div>
          <div className="cp-fl">
            <label className="lab" htmlFor="cp-starts_on">
              Valid from
            </label>
            <input type="date" className={"inp" + (errors.starts_on ? " bad" : "")} value={d.from} onChange={(e) => set("from", e.target.value)} {...fp("starts_on")} />
            {err("starts_on")}
          </div>
          <div className="cp-fl">
            <label className="lab" htmlFor="cp-ends_on">
              Valid to
            </label>
            <input type="date" className={"inp" + (errors.ends_on ? " bad" : "")} value={d.to} min={d.from || undefined} onChange={(e) => set("to", e.target.value)} {...fp("ends_on")} />
            {err("ends_on") ?? <span className="k">Both days count (India time).</span>}
          </div>
        </div>

        <fieldset className="cp-set">
          <legend className="lab">Plans</legend>
          <div className="cp-chips" id="cp-plan_codes" tabIndex={-1}>
            {paid.map((p) => {
              const on = d.plans.includes(p.code);
              return (
                <button
                  key={p.code}
                  type="button"
                  className={"chip" + (on ? " on" : "")}
                  aria-pressed={on}
                  onClick={() => set("plans", on ? d.plans.filter((c) => c !== p.code) : [...d.plans, p.code])}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
          {err("plan_codes") ?? <span className="k">{d.plans.length ? `Only for ${planNames(d.plans, plans)}.` : "None picked: any plan."}</span>}
        </fieldset>

        <fieldset className="cp-set">
          <legend className="lab">Where we share it</legend>
          <div className="cp-chips" id="cp-channel" tabIndex={-1}>
            {CHANNELS.map((ch) => (
              <button key={ch} type="button" className={"chip" + (d.channel === ch ? " on" : "")} aria-pressed={d.channel === ch} onClick={() => set("channel", ch)}>
                {CHANNEL_LABEL[ch]}
              </button>
            ))}
          </div>
          {err("channel")}
        </fieldset>

        <div className="cp-fl">
          <label className="lab" htmlFor="cp-campaign">
            Campaign
          </label>
          <input className={"inp" + (errors.campaign ? " bad" : "")} maxLength={120} placeholder="IT Is OK · Stage 2" value={d.campaign} onChange={(e) => set("campaign", e.target.value)} {...fp("campaign")} />
          {err("campaign")}
        </div>

        <p className="cp-note">
          <PathIcon d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5M12 8h.01" size={16} />
          <span>One code per company, ever. A company that already used a code sees “You have used a code before” at checkout.</span>
        </p>

        {error ? (
          <p className="err-box" role="alert">
            {error}
          </p>
        ) : null}

        <div className="cp-form__foot">
          <button type="submit" className="btn dark" disabled={busy}>
            {busy ? "Saving…" : isNew ? "Save code" : "Save changes"}
          </button>
          <button type="button" className="btn" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>

      <aside className="cp-pv" aria-label="What the customer pays">
        <span className="lab">What the customer pays, first month</span>
        {previewPlans.length === 0 ? <span className="k">No paid plans to show.</span> : null}
        {previewPlans.map(({ p, r }) => (
          <div key={p.code} className="cp-pv__row">
            <span className="cp-pv__top">
              <b>{p.name}</b>
              <span className="num">
                {r.off > 0 ? <s className="k">{money(r.today)}</s> : null} <b>{money(r.after)}</b>
              </span>
            </span>
            <span className="cp-pv__note">
              {`Saves ${money(r.off)}${p.pcs ? ` · ${money(Math.round(r.after / p.pcs))} per PC a month for ${p.pcs} PCs` : ""}`}
            </span>
          </div>
        ))}
        <span className="k cp-pv__foot">
          Prices before GST. From the second month they pay today’s price.
        </span>
      </aside>
    </div>
  );
}

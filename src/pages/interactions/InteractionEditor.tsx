import { useCallback, useEffect, useState, type ReactElement, type ReactNode } from "react";
import {
  ApiError,
  createAnnouncement,
  getInteractionReach,
  updateAnnouncement,
  type AnnouncementAudience,
  type AnnouncementKind,
  type InteractionFrequency,
  type InteractionTrigger,
  type PlanSummary,
} from "../../lib/api";
import { CHANNEL_LABEL, couponRange, getCoupons, type Coupon } from "../../lib/couponsApi";
import { useLoad } from "../../lib/useLoad";
import { PREVIEW_OWNER } from "../../content/fixtures/announcements";
import { PeoplePicker } from "../../components/PeoplePicker";
import { PicturePicker, pictureChange, usePictureSrc, type PictureEdit } from "../../components/PicturePicker";
import {
  BAR_KINDS,
  FIELD_KEYS,
  FREQUENCIES_BAR,
  FREQUENCIES_DIALOG,
  PLACEMENTS,
  POPUP_KINDS,
  RHYTHM,
  TRIGGERS,
  UI_KINDS,
  WHAT_NOTE,
  fromLocalInput,
  isBar,
  linkError,
  needsDays,
  offerButton,
  offerModeOf,
  offerToPaid,
  stamp,
  toLocalInput,
  uiKindOf,
  validate,
  withWhat,
  type Draft,
  type FieldKey,
  type OfferMode,
} from "./model";
import { BarPreview, DialogPreview, OwnerView } from "./Previews";

export interface Editing {
  id: number | "new";
  draft: Draft;
  savedPicture: string | null;
  picture: PictureEdit;
}

const TITLE_PH: Record<string, string> = {
  offer: "New Year, new team plan",
  feedback: "How likely are you to tell a friend about Zinwe?",
  upgrade: "Your team has grown to 3 PCs",
  wish: "Happy New Year, {first name}",
  popup: "New: chat about any task",
  announce: "Short update on Sunday.",
};
const BODY_PH: Record<string, string> = {
  offer: "Get 30% off your first month of Startups.",
  feedback: "One tap. It helps us decide what to build next.",
  upgrade: "Free covers 3 PCs. Startups covers 10, with reports and chat history.",
  wish: "Thank you for running your team with Zinwe this year.",
  popup: "Every task now has a chat icon. Click it to ask your team about that task.",
  announce: "Zinwe will be paused 2:00–2:20 AM on Sunday. Your PCs keep working and catch up after.",
};

function Step({ n, title, hint, children }: { n: number; title: string; hint: string; children: ReactNode }): ReactElement {
  return (
    <section className="card ix-step" aria-labelledby={`ix-step-${n}`}>
      <span className="ix-step__head">
        <span className="ix-step__n" aria-hidden="true">
          {n}
        </span>
        <span className="ix-step__title" id={`ix-step-${n}`}>
          {title}
        </span>
        <span className="k">{hint}</span>
      </span>
      {children}
    </section>
  );
}

function Chip({ on, onClick, children, disabled }: { on: boolean; onClick: () => void; children: ReactNode; disabled?: boolean }): ReactElement {
  return (
    <button type="button" className={"chip" + (on ? " on" : "")} aria-pressed={on} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

/** How many owners match now (null while it loads, or for the website). */
function useReach(d: Draft): number | null {
  const [n, setN] = useState<number | null>(null);
  const plans = d.audience === "plans" ? d.plan_codes.join(",") : "";
  const emails = d.audience === "owners" ? d.owner_emails.join(",") : "";
  const days = d.audience === "quiet" ? d.audience_days : null;
  const web = d.placement === "website";
  useEffect(() => {
    if (web) return;
    let alive = true;
    setN(null);
    const timer = window.setTimeout(() => {
      getInteractionReach({
        placement: d.placement,
        kind: d.kind,
        audience: d.audience,
        plan_codes: plans ? plans.split(",") : [],
        owner_emails: emails ? emails.split(",") : [],
        audience_days: days,
      })
        .then((r) => alive && setN(r.customers))
        .catch(() => alive && setN(null));
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [d.placement, d.kind, d.audience, plans, emails, days, web]);
  return web ? null : n;
}

/**
 * The User interactions editor (board LabV135AdminInteractions "Make one"): 1 When, 2 Who, 3 What (with the kind's own
 * fields: the old Pop-up and Announcement editors), 4 How often, and the live preview. "Save and turn on",
 * "Save as draft" (off) and "Show it to me first".
 */
export function InteractionEditor({
  editing,
  plans,
  onCancel,
  onSaved,
}: {
  editing: Editing;
  plans: PlanSummary[];
  onCancel: () => void;
  onSaved: (message: string) => void;
}): ReactElement {
  const isNew = editing.id === "new";
  const [d, setD] = useState<Draft>(editing.draft);
  const [mode, setMode] = useState<OfferMode>(() => offerModeOf(editing.draft));
  const [picture, setPicture] = useState<PictureEdit>(editing.picture);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showing, setShowing] = useState(false);
  const pictureSrc = usePictureSrc(picture, editing.savedPicture);
  const reach = useReach(d);
  const loadCoupons = useCallback(() => getCoupons().catch(() => null), []);
  const coupons = useLoad(loadCoupons);
  const couponList = coupons.data?.coupons ?? [];
  const couponPlans = coupons.data?.plans ?? [];
  const coupon: Coupon | null = d.coupon !== null ? (couponList.find((c) => c.id === d.coupon) ?? null) : null;
  const couponChoices = couponList.filter((c) => c.id === d.coupon || (c.status !== "ended" && c.status !== "cancelled"));

  const ui = uiKindOf(d);
  const bar = isBar(d);
  const paidPlans = plans.filter((p) => Number(p.price_inr_monthly) > 0);
  const web = d.placement === "website";

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setD((f) => ({ ...f, [key]: value }));
    setErrors((e) => (key in e ? { ...e, [key]: undefined } : e));
  };
  const setWho = (audience: AnnouncementAudience, extra: Partial<Draft> = {}) => {
    setD((f) => ({ ...f, audience, ...extra }));
    setErrors((e) => ({ ...e, plan_codes: undefined, owner_emails: undefined, audience_days: undefined, audience: undefined }));
  };
  const togglePlan = (code: string) => {
    const base = d.audience === "plans" ? d.plan_codes : [];
    const next = base.includes(code) ? base.filter((c) => c !== code) : [...base, code];
    if (next.length === 0) setWho("everyone", { plan_codes: [] });
    else setWho("plans", { plan_codes: next });
  };
  const pickWhat = (next: (typeof UI_KINDS)[number][0]) => {
    setD((f) => withWhat(f, next));
    if (next !== "offer") setMode("link");
    else if (ui !== "offer") setMode("coupon");
    setErrors({});
  };
  const pickTrigger = (t: InteractionTrigger) => {
    setD((f) => ({ ...f, trigger: t, trigger_days: needsDays(t) ? (f.trigger_days ?? (t === "before_plan_end" ? 3 : 7)) : f.trigger_days }));
    setErrors((e) => ({ ...e, trigger_days: undefined }));
  };

  const save = async (turnOn: boolean) => {
    const found = validate(d, mode);
    setErrors(found);
    if (Object.keys(found).length) {
      window.setTimeout(() => document.getElementById(`ix-${Object.keys(found)[0]}`)?.focus(), 0);
      return;
    }
    setBusy(true);
    setError("");
    const priced = (ui === "offer" && mode === "price") || (ui === "announce" && Boolean(d.offer_plan));
    const withCoupon = ui === "offer" && mode === "coupon";
    const code = coupon?.code ?? "";
    let cta_label = d.cta_label.trim();
    let cta_href = d.cta_href.trim();
    if (ui === "feedback") cta_label = cta_href = "";
    else if (withCoupon) {
      cta_label = cta_label || "Use the code";
      cta_href = code ? `/onboarding/plan?coupon=${encodeURIComponent(code)}` : cta_href;
    } else if (ui === "offer" && mode === "price") cta_label = cta_href = ""; // the server makes "Upgrade for ₹… + GST"
    const payload: Draft = {
      ...d,
      title: d.title.trim(),
      body: d.body.trim(),
      cta_label,
      cta_href,
      is_active: turnOn,
      plan_codes: d.audience === "plans" ? d.plan_codes : [],
      owner_emails: d.audience === "owners" ? d.owner_emails : [],
      audience_days: d.audience === "quiet" ? d.audience_days : null,
      trigger_days: needsDays(d.trigger) ? d.trigger_days : null,
      coupon: withCoupon ? d.coupon : null,
      offer_plan: priced ? d.offer_plan : null,
      offer_price_inr: priced ? d.offer_price_inr : null,
      ...(web ? { audience: "everyone" as const, plan_codes: [], owner_emails: [], audience_days: null } : {}),
    };
    try {
      const image = bar ? null : pictureChange(picture, Boolean(editing.savedPicture));
      const saved = isNew ? await createAnnouncement(payload, image) : await updateAnnouncement(editing.id as number, payload, image);
      onSaved(
        !turnOn
          ? "Saved as a draft. It stays off until you turn it on."
          : saved.status === "scheduled"
            ? `Saved and on. It starts on ${stamp(saved.starts_at)}.`
            : bar
              ? "Saved and on. Owners see it on their next page load."
              : "Saved and on. Owners see it at the right moment.",
      );
    } catch (e) {
      const fields = e instanceof ApiError ? e.fields : {};
      const at = Object.fromEntries(Object.entries(fields).filter(([k]) => FIELD_KEYS.includes(k))) as Partial<Record<FieldKey, string>>;
      if (Object.keys(at).length) setErrors(at);
      const rest = Object.entries(fields).filter(([k]) => !FIELD_KEYS.includes(k));
      setError(Object.keys(at).length && !rest.length ? "Fix the highlighted fields first." : (rest[0]?.[1] ?? (e instanceof Error ? e.message : "Couldn’t save it. Try again.")));
      setBusy(false);
    }
  };

  const err = (k: FieldKey) =>
    errors[k] ? (
      <span className="field-err" id={`ix-${k}-error`}>
        {errors[k]}
      </span>
    ) : null;
  const fp = (k: FieldKey) => ({
    id: `ix-${k}`,
    "aria-invalid": errors[k] ? true : undefined,
    "aria-describedby": errors[k] ? `ix-${k}-error` : undefined,
  });

  const titleMax = Math.max(120, d.title.length);
  const bodyMax = Math.max(bar ? 160 : 280, d.body.length);
  const kindOpts: [AnnouncementKind, string][] = ui === "announce" ? BAR_KINDS : ui === "popup" ? POPUP_KINDS : [];
  const freqOpts: [InteractionFrequency, string][] = bar ? FREQUENCIES_BAR : FREQUENCIES_DIALOG;
  const ownLink = ui !== "feedback" && !(ui === "offer" && mode === "price");
  const linkFixed = ui === "offer" && mode === "coupon";
  const reachText = web ? "Every visitor of zinwe.io sees it" : `Reaches ${reach ?? "…"} ${reach === 1 ? "owner" : "owners"}`;

  return (
    <div className="ix-ed">
      <form
        className="ix-form"
        aria-label="Interaction"
        onSubmit={(e) => {
          e.preventDefault();
          void save(true);
        }}
      >
        <div className="ix-form__head">
          <h2>{isNew ? "New interaction" : `Edit “${d.title || "interaction"}”`}</h2>
          <button type="button" className="btn sm" onClick={onCancel} disabled={busy}>
            Back to the list
          </button>
        </div>

        {/* 1 · When */}
        <Step n={1} title="When" hint="The moment it shows">
          {bar ? null : (
            <div className="ix-chips" role="group" aria-label="When" id="ix-trigger" tabIndex={-1}>
              {TRIGGERS.map(([t, label]) => (
                <Chip key={t} on={d.trigger === t} onClick={() => pickTrigger(t)}>
                  {label}
                </Chip>
              ))}
            </div>
          )}
          {err("trigger")}
          {!bar && needsDays(d.trigger) ? (
            <div className="ix-inline">
              <label className="lab" htmlFor="ix-trigger_days">
                {d.trigger === "before_plan_end" ? "Days before the plan ends" : "Days after sign-up"}
              </label>
              <input
                type="number"
                min={1}
                max={365}
                className={"inp ix-num" + (errors.trigger_days ? " bad" : "")}
                value={d.trigger_days ?? ""}
                onChange={(e) => set("trigger_days", e.target.value ? Math.round(Number(e.target.value)) : null)}
                {...fp("trigger_days")}
              />
              {err("trigger_days")}
            </div>
          ) : null}
          {!bar && d.trigger === "signout" ? <p className="ix-note">Sign-out never waits: “Just sign out” is always one click.</p> : null}
          {!bar && d.trigger === "first_pc" ? <p className="ix-note">Shows at the owner’s next sign-in after their first PC is enrolled.</p> : null}
          <div className="ix-two">
            <div className="ix-fl">
              <label className="lab" htmlFor="ix-starts_at">
                {d.trigger === "date" && !bar ? "Shows on" : "Starts"}
              </label>
              <input
                type="datetime-local"
                className={"inp" + (errors.starts_at ? " bad" : "")}
                value={toLocalInput(d.starts_at)}
                onChange={(e) => set("starts_at", fromLocalInput(e.target.value) ?? new Date().toISOString())}
                {...fp("starts_at")}
              />
              {err("starts_at")}
            </div>
            <div className="ix-fl">
              <label className="lab" htmlFor="ix-ends_at">
                Ends{" "}
                <span className="k" style={{ fontWeight: 400 }}>
                  · leave empty to keep it on
                </span>
              </label>
              <input
                type="datetime-local"
                className={"inp" + (errors.ends_at ? " bad" : "")}
                value={toLocalInput(d.ends_at)}
                onChange={(e) => set("ends_at", fromLocalInput(e.target.value))}
                {...fp("ends_at")}
              />
              {err("ends_at")}
            </div>
          </div>
        </Step>

        {/* 2 · Who */}
        <Step n={2} title="Who" hint="Owners only, never employees">
          {web ? (
            <p className="ix-note">Every visitor of zinwe.io sees a website bar. Who applies to dashboard bars and pop-ups.</p>
          ) : (
            <>
              <div className="ix-chips" role="group" aria-label="Who" id="ix-audience" tabIndex={-1}>
                <Chip on={d.audience === "everyone"} onClick={() => setWho("everyone")}>
                  Everyone
                </Chip>
                <Chip on={d.audience === "owners"} onClick={() => setWho("owners")}>
                  Picked people
                </Chip>
                <Chip on={d.audience === "new7"} onClick={() => setWho("new7")}>
                  New in first 7 days
                </Chip>
                <Chip on={d.audience === "free"} onClick={() => setWho("free")}>
                  Free
                </Chip>
                {paidPlans.map((p) => (
                  <Chip key={p.code} on={d.audience === "plans" && d.plan_codes.includes(p.code)} onClick={() => togglePlan(p.code)}>
                    {p.name}
                  </Chip>
                ))}
                <Chip on={d.audience === "paid"} onClick={() => setWho("paid")}>
                  Every paid plan
                </Chip>
                <Chip on={d.audience === "plan_ending"} onClick={() => setWho("plan_ending")}>
                  Plan ending
                </Chip>
                <Chip on={d.audience === "quiet"} onClick={() => setWho("quiet", { audience_days: d.audience_days ?? 14 })}>
                  Quiet for N days
                </Chip>
              </div>
              {d.audience === "plans" && d.plan_codes.some((c) => !paidPlans.some((p) => p.code === c)) ? (
                <span className="k">Also: {d.plan_codes.filter((c) => !paidPlans.some((p) => p.code === c)).join(", ")}</span>
              ) : null}
              {d.audience === "quiet" ? (
                <div className="ix-inline">
                  <label className="lab" htmlFor="ix-audience_days">
                    No owner sign-in for
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    className={"inp ix-num" + (errors.audience_days ? " bad" : "")}
                    value={d.audience_days ?? ""}
                    onChange={(e) => set("audience_days", e.target.value ? Math.round(Number(e.target.value)) : null)}
                    {...fp("audience_days")}
                  />
                  <span className="k">days</span>
                  {err("audience_days")}
                </div>
              ) : null}
              {d.audience === "plan_ending" ? <p className="ix-note">Owners whose plan or free trial ends within 7 days.</p> : null}
              {d.audience === "owners" ? <PeoplePicker emails={d.owner_emails} onChange={(list) => set("owner_emails", list)} invalid={Boolean(errors.owner_emails)} /> : null}
              {err("plan_codes")}
              {err("owner_emails")}
              {err("audience")}
              <span className="ix-reach" role="status">
                <b className="num">{reach ?? "…"}</b> {reach === 1 ? "owner matches" : "owners match"} right now.
              </span>
              {offerToPaid(d, plans) ? (
                <p className="ix-warn" role="alert">
                  Paid plans never see offer pop-ups. Owners on a paid plan in this audience won’t see it.
                </p>
              ) : null}
            </>
          )}
        </Step>

        {/* 3 · What */}
        <Step n={3} title="What" hint="One thing per interaction">
          <div className="ix-chips" role="group" aria-label="What">
            {UI_KINDS.map(([k, label]) => (
              <Chip key={k} on={ui === k} onClick={() => pickWhat(k)}>
                {label}
              </Chip>
            ))}
          </div>
          <p className="ix-note">{WHAT_NOTE[ui]}</p>

          {kindOpts.length ? (
            <div className="ix-fl">
              <span className="lab" id="ix-type-l">
                Type
              </span>
              <div className="seg" role="group" aria-labelledby="ix-type-l" style={{ alignSelf: "flex-start" }}>
                {(kindOpts.some(([k]) => k === d.kind) ? kindOpts : [...kindOpts, [d.kind, d.kind] as [AnnouncementKind, string]]).map(([k, label]) => (
                  <button key={k} type="button" className={d.kind === k ? "on" : ""} aria-pressed={d.kind === k} onClick={() => set("kind", k)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {ui === "announce" ? (
            <div className="ix-fl">
              <span className="lab" id="ix-where-l">
                Where it shows
              </span>
              <div className="ix-chips" role="group" aria-labelledby="ix-where-l" id="ix-placement" tabIndex={-1}>
                {PLACEMENTS.map(([k, label]) => (
                  <Chip key={k} on={d.placement === k} onClick={() => setD((f) => ({ ...f, placement: k, ...(k === "website" ? { audience: "everyone" as const } : {}) }))}>
                    {label}
                  </Chip>
                ))}
              </div>
              {err("placement")}
            </div>
          ) : (
            err("placement")
          )}

          <div className="ix-fl">
            <div className="ix-fl__row">
              <label className="lab" htmlFor="ix-title">
                {bar ? "Headline" : "Title"}
              </label>
              <span className="k num">
                {d.title.length} / {titleMax}
              </span>
            </div>
            <input className={"inp" + (errors.title ? " bad" : "")} maxLength={titleMax} placeholder={TITLE_PH[ui]} value={d.title} onChange={(e) => set("title", e.target.value)} {...fp("title")} />
            {err("title")}
          </div>

          <div className="ix-fl">
            <div className="ix-fl__row">
              <label className="lab" htmlFor="ix-body">
                Text{" "}
                <span className="k" style={{ fontWeight: 400 }}>
                  · optional, {bar ? "one short line" : "one or two lines"}
                </span>
              </label>
              <span className="k num">
                {d.body.length} / {bodyMax}
              </span>
            </div>
            <textarea className="ta ix-ta" maxLength={bodyMax} placeholder={BODY_PH[ui]} value={d.body} onChange={(e) => set("body", e.target.value)} {...fp("body")} />
            {err("body")}
            <span className="k">Write {"{first name}"} to use the owner’s first name. When an owner has none, it is left out with the comma before it.</span>
          </div>

          {bar ? null : <PicturePicker edit={picture} savedUrl={editing.savedPicture} onChange={setPicture} hint="PNG, JPG or WebP, up to 2 MB. Shown on top, 2:1 (for example 880 × 440)." />}

          {ui === "offer" ? (
            <fieldset className="ix-set">
              <legend className="lab">The offer</legend>
              <div className="seg" role="group" aria-label="The offer" style={{ alignSelf: "flex-start" }}>
                {(
                  [
                    ["coupon", "Coupon code"],
                    ["price", "Special price"],
                    ["link", "Just a link"],
                  ] as [OfferMode, string][]
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    className={mode === k ? "on" : ""}
                    aria-pressed={mode === k}
                    onClick={() => {
                      setMode(k);
                      setD((f) => ({ ...f, coupon: k === "coupon" ? f.coupon : null, offer_plan: k === "price" ? f.offer_plan : null, offer_price_inr: k === "price" ? f.offer_price_inr : null }));
                      setErrors((e) => ({ ...e, coupon: undefined, offer_plan: undefined, offer_price_inr: undefined }));
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {mode === "coupon" ? (
                <>
                  <label className="sr" htmlFor="ix-coupon">
                    Coupon code
                  </label>
                  <select
                    className={"inp" + (errors.coupon ? " bad" : "")}
                    value={d.coupon ?? ""}
                    onChange={(e) => set("coupon", e.target.value ? Number(e.target.value) : null)}
                    {...fp("coupon")}
                  >
                    <option value="">{coupons.data === undefined ? "Loading codes…" : couponChoices.length ? "Pick a code" : "No live or scheduled code"}</option>
                    {couponChoices.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} · {c.percent_off}% off · {couponRange(c.starts_on, c.ends_on)} · {CHANNEL_LABEL[c.channel]}
                      </option>
                    ))}
                  </select>
                  {err("coupon")}
                  <span className="k">
                    From Coupons. “Use the code” opens the plan page with the code filled in; the price shows after the code. An offer price
                    takes no code. {coupons.data === null ? "Couldn’t load the codes right now." : ""}
                  </span>
                </>
              ) : null}
              {mode === "price" ? <SpecialPrice d={d} plans={paidPlans} set={set} err={err} fp={fp} errors={errors} /> : null}
            </fieldset>
          ) : null}

          {ui === "announce" && !web ? (
            <fieldset className="ix-set">
              <legend className="lab">
                Special price{" "}
                <span className="k" style={{ fontWeight: 400 }}>
                  · optional
                </span>
              </legend>
              <SpecialPrice d={d} plans={paidPlans} set={set} err={err} fp={fp} errors={errors} optional />
            </fieldset>
          ) : null}

          {ownLink ? (
            <div className="ix-two">
              <div className="ix-fl">
                <label className="lab" htmlFor="ix-cta_label">
                  Button text{" "}
                  <span className="k" style={{ fontWeight: 400 }}>
                    · optional
                  </span>
                </label>
                <input
                  className={"inp" + (errors.cta_label ? " bad" : "")}
                  maxLength={40}
                  placeholder={linkFixed ? "Use the code" : ui === "announce" && d.offer_plan ? offerButton(d.offer_price_inr) : ui === "upgrade" ? "See Startups" : "Show me"}
                  value={d.cta_label}
                  onChange={(e) => set("cta_label", e.target.value)}
                  {...fp("cta_label")}
                />
                {err("cta_label")}
              </div>
              {linkFixed ? (
                <div className="ix-fl">
                  <span className="lab">Link</span>
                  <span className="k ix-fixed mono">/onboarding/plan?coupon={coupon?.code ?? "CODE"}</span>
                </div>
              ) : (
                <div className="ix-fl">
                  <label className="lab" htmlFor="ix-cta_href">
                    Link
                  </label>
                  <input
                    className={"inp" + (errors.cta_href ? " bad" : "")}
                    maxLength={300}
                    placeholder={ui === "upgrade" ? "/app/upgrade" : "/app/whats-new or https://zinwe.io/…"}
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
              )}
            </div>
          ) : null}

          {bar ? (
            <div className="ix-bar-opts">
              <label className="sw">
                <input type="checkbox" role="switch" checked={d.dismissible} onChange={(e) => set("dismissible", e.target.checked)} />
                <span className="tr" aria-hidden="true">
                  <span />
                </span>
                <span className="an-sw__text">
                  Owners can close it
                  <span className="k">{d.dismissible ? "A close button hides it for that owner." : "It stays until the end date. Use this for maintenance."}</span>
                </span>
              </label>
              <div className="ix-inline">
                <label className="lab" htmlFor="ix-prio">
                  Priority
                </label>
                <input
                  id="ix-prio"
                  type="number"
                  min={0}
                  max={100}
                  className="inp ix-num"
                  value={d.priority}
                  onChange={(e) => set("priority", Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                />
                <span className="k">When two bars apply, the higher one shows first.</span>
              </div>
            </div>
          ) : null}
        </Step>

        {/* 4 · How often */}
        <Step n={4} title="How often" hint="Per owner">
          <div className="ix-chips" role="group" aria-label="How often" id="ix-frequency" tabIndex={-1}>
            {freqOpts.map(([f, label]) => (
              <Chip key={f} on={d.frequency === f} onClick={() => set("frequency", f)}>
                {label}
              </Chip>
            ))}
          </div>
          {err("frequency")}
          {!bar && d.frequency === "rhythm" ? <p className="ix-note">{RHYTHM}</p> : null}
          <p className="ix-note">
            {bar
              ? "Bars don’t count toward the one-a-day limit for pop-ups."
              : "An owner never sees more than one interaction in a day, whatever is picked here."}
          </p>
        </Step>

        {error ? (
          <p className="err-box" role="alert">
            {error}
          </p>
        ) : null}

        <div className="ix-form__foot">
          <button type="submit" className="btn dark" disabled={busy}>
            {busy ? "Saving…" : "Save and turn on"}
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => void save(false)}>
            Save as draft
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => setShowing(true)}>
            <span>Show it to me first</span>
          </button>
          <button type="button" className="btn ix-cancel" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>

      <aside className="ix-pv" aria-label="Preview">
        <span className="ix-pv__label">PREVIEW · AS {PREVIEW_OWNER.toUpperCase()} SEES IT</span>
        {bar ? (
          <BarPreview d={d} />
        ) : (
          <div className="ix-pv__stage">
            <DialogPreview d={d} mode={mode} coupon={coupon} couponPlans={couponPlans} pictureSrc={pictureSrc} />
          </div>
        )}
        <span className="k ix-pv__reach">{reachText}. Employees never see these.</span>
      </aside>

      {showing ? <OwnerView d={d} mode={mode} coupon={coupon} couponPlans={couponPlans} pictureSrc={pictureSrc} onClose={() => setShowing(false)} /> : null}
    </div>
  );
}

/** Plan + price (rupees, before GST, one billing cycle, paid online, once per owner while it is live). */
function SpecialPrice({
  d,
  plans,
  set,
  err,
  fp,
  errors,
  optional,
}: {
  d: Draft;
  plans: PlanSummary[];
  set: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  err: (k: FieldKey) => ReactNode;
  fp: (k: FieldKey) => { id: string; "aria-invalid"?: boolean; "aria-describedby"?: string };
  errors: Partial<Record<FieldKey, string>>;
  optional?: boolean;
}): ReactElement {
  return (
    <>
      <div className="ix-two">
        <div className="ix-fl">
          <label className="sr" htmlFor="ix-offer_plan">
            Special price plan
          </label>
          <select className={"inp" + (errors.offer_plan ? " bad" : "")} value={d.offer_plan ?? ""} onChange={(e) => set("offer_plan", e.target.value || null)} {...fp("offer_plan")}>
            <option value="">{optional ? "No special price" : "Pick the plan"}</option>
            {plans.map((p) => (
              <option key={p.code} value={p.code}>
                Upgrade to {p.name}
              </option>
            ))}
          </select>
          {err("offer_plan")}
        </div>
        {d.offer_plan || !optional ? (
          <div className="ix-fl">
            <label className="sr" htmlFor="ix-offer_price_inr">
              Price in ₹, before GST
            </label>
            <input
              type="number"
              min={1}
              step="0.01"
              inputMode="decimal"
              className={"inp" + (errors.offer_price_inr ? " bad" : "")}
              placeholder="Price in ₹, before GST"
              value={d.offer_price_inr ?? ""}
              onChange={(e) => set("offer_price_inr", e.target.value || null)}
              {...fp("offer_price_inr")}
            />
            {err("offer_price_inr")}
          </div>
        ) : null}
      </div>
      {d.offer_plan ? (
        <span className="k">
          One billing cycle, paid online only, once per owner, while this is live. Renewals are at the normal price. A coupon code can’t be
          added to it. The button reads “{d.cta_label.trim() || offerButton(d.offer_price_inr)}”.
        </span>
      ) : null}
    </>
  );
}

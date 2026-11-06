import { useState, type ReactElement } from "react";
import type { AnnouncementKind } from "../../lib/api";
import { couponDay, firstMonth, type Coupon, type CouponPlan } from "../../lib/couponsApi";
import { money } from "../../lib/format";
import { BAR_LADDER, PREVIEW_AS, PREVIEW_OWNER, SYSTEM_BARS, type PreviewAs } from "../../content/fixtures/announcements";
import { MomentPreview } from "../../components/MomentPreview";
import { Modal } from "../../components/Modal";
import { Icon, PathIcon } from "../../components/icons";
import { fillName, isBar, offerButton, RHYTHM, uiKindOf, type Draft, type OfferMode } from "./model";

/* ---------- The dashboard's bar colours and icons (white / black / orange only) ---------- */

const NEWS_BAR: [string, string, string, string] = ["#F5F5F5", "#141210", "#141210", "#FFFFFF"];
const NEWS_ICON = "M12 8h.01M11 12h1v5h1M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z";
const KIND_BAR: Partial<Record<AnnouncementKind, [string, string, string, string]>> = {
  news: ["#F5F5F5", "#141210", "#141210", "#FFFFFF"],
  offer: ["#141210", "#FFFFFF", "#FFFFFF", "#141210"],
  discount: ["#141210", "#FFFFFF", "#FFFFFF", "#141210"],
  maintenance: ["#FDEBDC", "#8A3A04", "#8A3A04", "#FFFFFF"],
  version: ["#F5F5F5", "#141210", "#141210", "#FFFFFF"],
  wish: ["#FFFFFF", "#141210", "#F26A0A", "#FFFFFF"],
};
const KIND_ICON: Partial<Record<AnnouncementKind, string>> = {
  news: "M12 8h.01M11 12h1v5h1M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
  offer: "M20 12l-8 8-9-9V3h8zM7.5 7.5h.01",
  discount: "M20 12l-8 8-9-9V3h8zM7.5 7.5h.01",
  maintenance: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-.5-.5-2.5z",
  version: "M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z",
  wish: "M3 13h18a9 5 0 0 1-18 0zM12 3c1.6 2 2 3.4 2 4.5a2 2 0 0 1-4 0C10 6.4 10.4 5 12 3z",
};
const SYS_ICON = {
  warn: "M12 3.5L2.5 20h19zM12 10v4.5M12 17.5h.01",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
  pcs: "M3 4h18v12H3zM8 20h8M12 16v4",
};

/** The buttons the dashboard gives this interaction. */
export function dialogButtons(d: Draft, mode: OfferMode): { button: string; close?: string } {
  const ui = uiKindOf(d);
  const out = d.trigger === "signout";
  if (ui === "feedback") return { button: out ? "Send and sign out" : "Send", close: out ? "Just sign out" : "Not now" };
  let button = "";
  if (ui === "offer" && mode === "coupon") button = d.cta_label.trim() || "Use the code";
  else if (ui === "offer" && mode === "price") button = d.cta_label.trim() || offerButton(d.offer_price_inr);
  else if (d.cta_label.trim() && d.cta_href.trim()) button = d.cta_label.trim();
  return { button, close: out ? "Just sign out" : undefined };
}

/** "Startups ₹679.70 + GST for the first month, about ₹68 per PC. Ends 5 Jan." */
export function couponLine(coupon: Coupon, plans: CouponPlan[]): string {
  const paid = plans.filter((p) => Number(p.price_inr_monthly) > 0);
  const plan = (coupon.plan_codes.length ? paid.filter((p) => coupon.plan_codes.includes(p.code)) : paid).sort(
    (a, b) => Number(a.price_inr_monthly) - Number(b.price_inr_monthly),
  )[0];
  const ends = coupon.ends_on ? ` Ends ${couponDay(coupon.ends_on)}.` : "";
  if (!plan) return `${coupon.percent_off}% off the first month.${ends}`;
  const r = firstMonth(plan, coupon.percent_off);
  const perPc = plan.pcs ? `, about ${money(Math.round(r.after / plan.pcs))} per PC` : "";
  return `${plan.name} ${money(r.after)} + GST for the first month${perPc}.${ends}`;
}

/** The pop-up card as owners see it, with the coupon code or the 1-10 scale when it has one. */
export function DialogPreview({
  d,
  mode,
  coupon,
  couponPlans,
  pictureSrc,
  name = PREVIEW_OWNER,
}: {
  d: Draft;
  mode: OfferMode;
  coupon: Coupon | null;
  couponPlans: CouponPlan[];
  pictureSrc: string | null;
  name?: string | null;
}): ReactElement {
  const ui = uiKindOf(d);
  const { button, close } = dialogButtons(d, mode);
  return (
    <MomentPreview kind={d.kind} title={fillName(d.title, name)} body={fillName(d.body, name)} button={button} close={close} pictureSrc={pictureSrc}>
      {ui === "offer" && mode === "coupon" ? (
        <span className="mp__code">
          <b>{coupon ? coupon.code : "Pick a code"}</b>
          {coupon ? <span>{couponLine(coupon, couponPlans)}</span> : null}
        </span>
      ) : null}
      {ui === "feedback" ? (
        <>
          <span className="mp__scale">
            {Array.from({ length: 10 }, (_, i) => (
              <span key={i}>{i + 1}</span>
            ))}
          </span>
          <span className="mp__ends">
            <span>Not likely</span>
            <span>Very likely</span>
          </span>
          <span className="mp__more">Tell us more (optional)</span>
        </>
      ) : null}
    </MomentPreview>
  );
}

/** The bar at the top of the dashboard (or zinwe.io), as it shows. */
export function Bar({ d, name = PREVIEW_OWNER }: { d: Draft; name?: string | null }): ReactElement {
  const [bg, fg, bbg, bfg] = KIND_BAR[d.kind] ?? NEWS_BAR;
  const btn = d.cta_label.trim() || (d.offer_plan ? offerButton(d.offer_price_inr) : "");
  const title = fillName(d.title, name).trim();
  return (
    <div className="an-pv__bar" style={{ background: bg, color: fg }}>
      <span className="an-pv__icon">
        <PathIcon d={KIND_ICON[d.kind] ?? NEWS_ICON} size={15} strokeWidth={2} />
      </span>
      <span className="an-pv__text">
        <b style={{ fontWeight: 700, opacity: title ? 1 : 0.6 }}>{title || "Your headline"}</b> <span>{fillName(d.body, name).trim()}</span>
      </span>
      {btn ? (
        <span className="an-pv__btn" style={{ background: bbg, color: bfg }}>
          {btn} →
        </span>
      ) : null}
      {d.dismissible ? (
        <span aria-hidden="true" className="an-pv__x">
          <Icon name="close" size={15} strokeWidth={2} />
        </span>
      ) : null}
    </div>
  );
}

/** Announcements: the bar in a small dashboard, "Preview as" and "Which bar wins" (kept from the Announcements page). */
export function BarPreview({ d }: { d: Draft }): ReactElement {
  const [previewAs, setPreviewAs] = useState<PreviewAs>("normal");
  const winner = previewAs === "normal" ? "ann" : previewAs;
  const wi = BAR_LADDER.findIndex((l) => l.key === winner);
  let bar: ReactElement;
  if (previewAs === "normal") bar = <Bar d={d} />;
  else {
    const y = SYSTEM_BARS[previewAs];
    bar = (
      <div className="an-pv__bar" style={{ background: y.bar, color: y.fg }}>
        <span className="an-pv__icon">
          <PathIcon d={SYS_ICON[y.icon]} size={15} strokeWidth={2} />
        </span>
        <span className="an-pv__text">
          <b style={{ fontWeight: 700 }}>{y.title}</b> <span>{y.msg}</span>
        </span>
        {y.btn ? (
          <span className="an-pv__btn" style={{ background: y.btnBg, color: y.btnFg }}>
            {y.btn} →
          </span>
        ) : null}
      </div>
    );
  }
  return (
    <>
      <div className="an-pvas ix-pvas">
        <label className="k" htmlFor="ix-pv-as" style={{ fontWeight: 600 }}>
          Preview as
        </label>
        <select id="ix-pv-as" className="inp an-pvas__sel" value={previewAs} onChange={(e) => setPreviewAs(e.target.value as PreviewAs)}>
          {PREVIEW_AS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <figure aria-label="Preview of the customer dashboard" className="an-pv">
        <div aria-hidden="true" className="an-pv__chrome">
          <span className="an-pv__dots">
            <span />
            <span />
            <span />
          </span>
          <span className="mono an-pv__url">{d.placement === "website" ? "zinwe.io" : "app.zinwe.io/app"}</span>
        </div>
        <div className="an-pv__body">
          <div aria-hidden="true" className="an-pv__side">
            <span className="an-pv__logo" />
            <span className="an-pv__line" style={{ marginTop: 8 }} />
            <span className="an-pv__line" />
            <span className="an-pv__line" />
          </div>
          <div className="an-pv__main">
            {bar}
            <div aria-hidden="true" className="an-pv__content">
              <span className="an-pv__hello">Good afternoon, {PREVIEW_OWNER}</span>
              <div className="an-pv__tiles">
                <span />
                <span />
                <span />
              </div>
              <span className="an-pv__big" />
            </div>
          </div>
        </div>
      </figure>
      {winner !== "ann" ? (
        <p role="status" className="an-waits">
          This owner sees the {SYSTEM_BARS[previewAs as Exclude<PreviewAs, "normal">].name} bar instead. Your announcement shows once that
          clears.
        </p>
      ) : null}
      <p className="k ix-pv__rule">
        A strip across the top of every dashboard page until the owner closes it or it ends. It does not cover the page. When two
        strips are due, the higher priority one wins and the other waits.
      </p>
      <div className="an-ladder ix-ladder">
        <h3>Which bar wins</h3>
        <p className="k" style={{ margin: 0 }}>
          The dashboard shows one bar at a time. The first that applies to the owner wins.
        </p>
        <ol>
          {BAR_LADDER.map((l, i) => (
            <li key={l.key} className={i === wi ? "is-on" : i < wi ? "is-skip" : ""}>
              <span className="num an-ladder__n">{i + 1}</span>
              <span style={{ flex: "1 1 auto", minWidth: 0 }}>{l.label}</span>
              <span className="k" style={{ fontWeight: 600 }}>
                {i === wi ? "Showing" : i < wi ? "Doesn’t apply" : "Waits"}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}

/** The rule under "Show it to me first", in plain words. */
function ruleOf(d: Draft): string {
  const ui = uiKindOf(d);
  if (isBar(d)) return "Shows on every dashboard page until the owner closes it or it ends. Bars don't count toward the one-a-day limit.";
  const parts = ["Shows after the page loads, not before. Never two at once, and at most one interaction a day."];
  if (d.trigger === "signout") parts.push("“Just sign out” signs out at once.");
  if (ui === "feedback") parts.push("The answer lands in Inbox → Feedback with this interaction’s name.");
  if (ui === "offer") parts.push("“Use the code” opens the plan page with the code filled in.");
  if (d.frequency === "rhythm") parts.push(RHYTHM);
  if (/\{first name\}/i.test(d.title + d.body)) parts.push("{first name} comes from the owner’s profile. If it is missing, the line reads without a name.");
  return parts.join(" ");
}

/** "Show it to me first": the interaction over a dashboard page with the soft grey wash, at its real size. */
export function OwnerView({
  d,
  mode,
  coupon,
  couponPlans,
  pictureSrc,
  onClose,
}: {
  d: Draft;
  mode: OfferMode;
  coupon: Coupon | null;
  couponPlans: CouponPlan[];
  pictureSrc: string | null;
  onClose: () => void;
}): ReactElement {
  const [named, setNamed] = useState(true);
  const name = named ? PREVIEW_OWNER : null;
  const hasName = /\{first name\}/i.test(d.title + d.body);
  return (
    <Modal
      title="What owners see"
      subtitle={`As ${PREVIEW_OWNER} sees it in the dashboard. Nothing is sent.`}
      onClose={onClose}
      className="ix-owner-dialog"
      footer={
        <button type="button" className="btn dark" onClick={onClose}>
          Back to the editor
        </button>
      }
    >
      {hasName ? (
        <label className="ck ix-named">
          <input type="checkbox" checked={!named} onChange={(e) => setNamed(!e.target.checked)} />
          Show it for an owner with no first name
        </label>
      ) : null}
      <div className="ix-stage">
        {isBar(d) ? <Bar d={d} name={name} /> : null}
        <div className="ix-stage__page" aria-hidden="true">
          <span className="ix-stage__h">Overview</span>
          <span />
          <span />
          <span className="ix-stage__big" />
        </div>
        {isBar(d) ? null : (
          <div className="ix-stage__wash">
            <DialogPreview d={d} mode={mode} coupon={coupon} couponPlans={couponPlans} pictureSrc={pictureSrc} name={name} />
          </div>
        )}
      </div>
      <p className="k ix-stage__rule">{ruleOf(d)}</p>
    </Modal>
  );
}

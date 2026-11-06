/**
 * F-22 User interactions: the vocabulary and rules shared by the list and the editor. An interaction is an
 * Announcement row (z_auth): bars (placement dashboard / website / both) are "Announcements", everything with
 * placement "popup" is a dialog whose staff-facing kind comes from `kind`.
 */
import type {
  Announcement,
  AnnouncementAudience,
  AnnouncementInput,
  AnnouncementKind,
  AnnouncementPlacement,
  InteractionFrequency,
  InteractionStats,
  InteractionTrigger,
  PlanSummary,
} from "../../lib/api";

/** What staff pick in step 3 ("What"). */
export type UiKind = "offer" | "feedback" | "upgrade" | "wish" | "popup" | "announce";

export const UI_KINDS: [UiKind, string][] = [
  ["offer", "Offer with a coupon"],
  ["feedback", "Feedback ask, 1–10"],
  ["upgrade", "Upgrade ask"],
  ["wish", "Wish with {first name}"],
  ["popup", "Pop-up"],
  ["announce", "Announcement"],
];
export const UI_KIND_LABEL: Record<UiKind, string> = {
  offer: "Offer",
  feedback: "Feedback ask",
  upgrade: "Upgrade ask",
  wish: "Wish",
  popup: "Pop-up",
  announce: "Announcement",
};
export const UI_KIND_PLURAL: Record<UiKind, string> = {
  offer: "Offers",
  feedback: "Feedback asks",
  upgrade: "Upgrade asks",
  wish: "Wishes",
  popup: "Pop-ups",
  announce: "Announcements",
};
/** ?kind= in the URL ("announcement" and "popup" are the old pages' redirects). */
export const KIND_PARAM: Record<string, UiKind> = {
  offer: "offer",
  feedback: "feedback",
  feedback_ask: "feedback",
  upgrade: "upgrade",
  upgrade_ask: "upgrade",
  wish: "wish",
  popup: "popup",
  announcement: "announce",
  announce: "announce",
};
export const PARAM_OF: Record<UiKind, string> = {
  offer: "offer",
  feedback: "feedback",
  upgrade: "upgrade",
  wish: "wish",
  popup: "popup",
  announce: "announcement",
};

export const WHAT_NOTE: Record<UiKind, string> = {
  offer: "A pop-up with a coupon code from Coupons, or a special price. It shows the price after the code and the per-PC value. Paid plans never see offers.",
  feedback: "A 1–10 question. Answers land in Inbox → Feedback with the interaction’s name.",
  upgrade: "A pop-up that asks the owner to move to a bigger plan, with one button.",
  wish: "A wish for a festival or a moment, with the owner’s first name. No ask.",
  popup: "A message in the middle of the screen with a picture (optional) and one button: news, a new feature, a how-to. This was Publish → Pop-ups; it now also has when and who.",
  announce: "A strip at the top of every dashboard page: downtime, a price change, a holiday. Stays until closed or until its end date. This was Publish → Announcements; it now also has who.",
};

/** The bar types (Announcements), as the old Announcements page named them. */
export const BAR_KINDS: [AnnouncementKind, string][] = [
  ["news", "Info"],
  ["offer", "Offer"],
  ["discount", "Discount"],
  ["maintenance", "Maintenance"],
  ["version", "New release"],
  ["wish", "Wish"],
];
/** Pop-up types (the old Pop-ups page's news / new version, plus maintenance on older rows). */
export const POPUP_KINDS: [AnnouncementKind, string][] = [
  ["news", "News"],
  ["version", "New version"],
  ["maintenance", "Maintenance"],
];
export const PLACEMENTS: [AnnouncementPlacement, string][] = [
  ["dashboard", "Dashboard"],
  ["website", "Website"],
  ["both", "Dashboard + website"],
];

export function uiKindOf(a: Pick<AnnouncementInput, "kind" | "placement">): UiKind {
  if (a.placement !== "popup") return "announce";
  switch (a.kind) {
    case "offer":
    case "discount":
      return "offer";
    case "feedback_ask":
      return "feedback";
    case "upgrade_ask":
      return "upgrade";
    case "wish":
      return "wish";
    default:
      return "popup";
  }
}

export const isBar = (d: Pick<AnnouncementInput, "placement">) => d.placement !== "popup";

/* ---------- Draft ---------- */

export interface Draft extends AnnouncementInput {
  trigger: InteractionTrigger;
  trigger_days: number | null;
  audience_days: number | null;
  frequency: InteractionFrequency;
  coupon: number | null;
}

export function defaultFrequency(placement: AnnouncementPlacement): InteractionFrequency {
  return placement === "popup" ? "rhythm" : "until_closed";
}

export function emptyDraft(ui: UiKind = "popup"): Draft {
  const base: Draft = {
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
    trigger: "signin",
    trigger_days: null,
    audience_days: null,
    frequency: "rhythm",
    coupon: null,
  };
  return withWhat(base, ui);
}

/** The coupon id, whether the server sends the id or {id, code}. */
function couponId(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && "id" in v && typeof (v as { id: unknown }).id === "number") return (v as { id: number }).id;
  return null;
}

export function toDraft(a: Announcement): Draft {
  const {
    id: _id,
    status: _s,
    created_by: _c,
    created_at: _ca,
    updated_at: _u,
    offer_uses: _o,
    image_url: _i,
    stats: _st,
    coupon_code: _cc,
    trigger,
    trigger_days,
    audience_days,
    frequency,
    coupon,
    ...input
  } = a;
  return {
    ...input,
    trigger: trigger ?? "signin",
    trigger_days: trigger_days ?? null,
    audience_days: audience_days ?? null,
    frequency: frequency ?? defaultFrequency(a.placement),
    coupon: couponId(coupon),
  };
}

/** Step 3: switch what it is, keeping what still fits (title, text, dates, who). */
export function withWhat(d: Draft, ui: UiKind): Draft {
  const was = uiKindOf(d);
  const next: Draft = { ...d };
  if (ui === "announce") {
    if (!isBar(d)) next.placement = "dashboard";
    if (!BAR_KINDS.some(([k]) => k === d.kind)) next.kind = "news";
    if (next.trigger !== "date") next.trigger = "signin";
    next.frequency = d.frequency === "once" ? "once" : "until_closed";
    next.coupon = null;
  } else {
    next.placement = "popup";
    next.kind =
      ui === "offer"
        ? d.kind === "discount"
          ? "discount"
          : "offer"
        : ui === "feedback"
          ? "feedback_ask"
          : ui === "upgrade"
            ? "upgrade_ask"
            : ui === "wish"
              ? "wish"
              : POPUP_KINDS.some(([k]) => k === d.kind)
                ? d.kind
                : "news";
    if (was === "announce" || next.frequency === "until_closed") next.frequency = "rhythm";
    if (ui !== "offer") {
      next.coupon = null;
      next.offer_plan = null;
      next.offer_price_inr = null;
    }
    if (ui === "feedback") {
      next.cta_label = "";
      next.cta_href = "";
    }
  }
  if (next.placement === "website") next.audience = "everyone";
  return next;
}

/* ---------- Labels ---------- */

export const TRIGGERS: [InteractionTrigger, string][] = [
  ["signin", "On sign-in"],
  ["signout", "On sign-out"],
  ["days_after_signup", "N days after sign-up"],
  ["first_pc", "After first PC"],
  ["before_plan_end", "Before plan end"],
  ["date", "On a date"],
];
export const needsDays = (t: InteractionTrigger) => t === "days_after_signup" || t === "before_plan_end";

export const FREQUENCIES_DIALOG: [InteractionFrequency, string][] = [
  ["once", "Once"],
  ["every", "Every time"],
  ["rhythm", "The pop-up rhythm"],
  ["every_14d", "At most every 14 days"],
];
export const FREQUENCIES_BAR: [InteractionFrequency, string][] = [
  ["until_closed", "Until closed"],
  ["once", "Once"],
];
export const FREQUENCY_LABEL: Record<InteractionFrequency, string> = {
  once: "Once",
  every: "Every time",
  rhythm: "Pop-up rhythm",
  every_14d: "At most every 14 days",
  until_closed: "Until closed",
};

export const RHYTHM =
  "The pop-up rhythm: each owner sees it at their first sign-in after it goes live, then after 2 days, then after a week, at most 3 times. Closing it stops it.";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function d(iso: string | null): Date | null {
  if (!iso) return null;
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? null : t;
}
/** "1 Jan" (with the year when it isn't this year). */
export function day(iso: string | null): string {
  const t = d(iso);
  if (!t) return "";
  return `${t.getDate()} ${MON[t.getMonth()]}${t.getFullYear() !== new Date().getFullYear() ? ` ${t.getFullYear()}` : ""}`;
}
/** "1 Jan", "18–20 Dec", "28 Dec–3 Jan". */
export function dayRange(from: string | null, to: string | null): string {
  const a = d(from);
  const b = d(to);
  if (!a) return "";
  if (!b || (a.toDateString() === b.toDateString())) return day(from);
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) return `${a.getDate()}–${day(to)}`;
  return `${day(from)}–${day(to)}`;
}
/** "28 Oct, 14:40" (local time). */
export function stamp(iso: string | null): string {
  const t = d(iso);
  if (!t) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${day(iso)}, ${pad(t.getHours())}:${pad(t.getMinutes())}`;
}
export function toLocalInput(iso: string | null): string {
  const t = d(iso);
  if (!t) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}`;
}
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const t = new Date(value);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

type WhenFields = Pick<Draft, "trigger" | "trigger_days" | "starts_at" | "ends_at" | "placement">;

export function whenLabel(a: Partial<WhenFields> & Pick<AnnouncementInput, "starts_at" | "ends_at" | "placement">): string {
  const trigger = a.trigger ?? "signin";
  const n = a.trigger_days ?? null;
  // Bars show on every page between their dates: the dates are the "when".
  if (a.placement !== "popup") return a.ends_at || trigger === "date" ? `On a date · ${dayRange(a.starts_at, a.ends_at)}` : `From ${day(a.starts_at)}`;
  if (trigger === "date") return `On a date · ${dayRange(a.starts_at, a.ends_at)}`;
  switch (trigger) {
    case "signout":
      return "On sign-out";
    case "days_after_signup":
      return `${n ?? 7} ${n === 1 ? "day" : "days"} after sign-up`;
    case "first_pc":
      return "After first PC";
    case "before_plan_end":
      return `${n ?? 3} ${n === 1 ? "day" : "days"} before plan end`;
    default:
      return "On sign-in";
  }
}

export function whoLabel(
  a: Pick<AnnouncementInput, "audience" | "plan_codes" | "owner_emails" | "placement"> & { audience_days?: number | null },
  planName: (code: string) => string,
): string {
  if (a.placement === "website") return "Every visitor of zinwe.io";
  const base = ((): string => {
    switch (a.audience) {
      case "everyone":
        return "Everyone";
      case "free":
        return "Free plan";
      case "paid":
        return "Paid plans";
      case "plans":
        return a.plan_codes.map(planName).join(", ") || "No plan picked";
      case "owners":
        return a.owner_emails.length === 1 ? "1 person" : `${a.owner_emails.length} people`;
      case "new7":
        return "New in first 7 days";
      case "plan_ending":
        return "Plan ending";
      case "quiet":
        return `Quiet for ${a.audience_days ?? 14} days`;
      default:
        return a.audience;
    }
  })();
  return a.placement === "both" ? `${base} + website` : base;
}

export function oftenLabel(a: Pick<AnnouncementInput, "placement"> & { frequency?: InteractionFrequency }): string {
  return FREQUENCY_LABEL[a.frequency ?? defaultFrequency(a.placement)];
}

/** Live / Scheduled / Ended / Paused (off after it showed) / Draft (off, never shown). */
export function statusOf(a: Announcement): [string, string] {
  if (a.status === "live") return ["Live", "good"];
  if (a.status === "scheduled") return ["Scheduled", "info"];
  if (a.status === "ended") return ["Ended", "muted"];
  return shownOf(a.stats) > 0 ? ["Paused", "warn"] : ["Draft", "muted"];
}

export function shownOf(s: InteractionStats | null | undefined): number {
  return s ? (s.shown ?? s.owners ?? 0) : 0;
}

const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : "0%");
export function avgOf(v: number | string | null | undefined): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** The Result column: clicks for offers, pop-ups and upgrade asks, answers for feedback asks, closes for announcements. */
export function resultOf(a: Announcement): { result: string; note: string } {
  const s = a.stats;
  const shown = shownOf(s);
  const ui = uiKindOf(a);
  if (!shown) {
    if (a.status === "scheduled") return { result: "—", note: a.trigger === "date" ? `Shows on ${day(a.starts_at)}` : `Starts ${day(a.starts_at)}` };
    return { result: "—", note: ui === "wish" && !a.cta_label ? "Wish, no ask" : "Not shown yet" };
  }
  if (ui === "feedback") {
    const n = s?.feedback_count ?? 0;
    const avg = avgOf(s?.feedback_avg);
    return { result: `${n} sent`, note: `${pct(n, shown)}${avg !== null ? ` · avg ${avg.toFixed(1)}` : ""}` };
  }
  if (ui === "announce") {
    const paid = a.offer_plan ? ` · ${a.offer_uses} paid` : "";
    return { result: `${s?.closed ?? 0} closed`, note: `Seen by ${shown} ${shown === 1 ? "owner" : "owners"}${paid}` };
  }
  if (ui === "wish" && !a.cta_label) return { result: "—", note: "Wish, no ask" };
  const clicked = s?.clicked_owners ?? s?.clicks ?? 0;
  const paid = s?.paid_after ?? 0;
  const extra = ui === "offer" && a.offer_plan ? ` · ${a.offer_uses} paid` : paid ? ` · ${paid} paid` : "";
  return { result: `${clicked} clicked`, note: `${pct(clicked, shown)}${extra}` };
}

/* ---------- {first name} ---------- */

/** Put the owner's first name in, or drop the token and the comma or space before it when there is none. */
export function fillName(text: string, name: string | null): string {
  if (name) return text.replace(/\{first name\}/gi, name);
  return text.replace(/[,\s]*\{first name\}/gi, "").replace(/^\s+/, "");
}

/* ---------- Checks ---------- */

export type FieldKey =
  | "title"
  | "body"
  | "cta_label"
  | "cta_href"
  | "plan_codes"
  | "owner_emails"
  | "offer_plan"
  | "offer_price_inr"
  | "placement"
  | "starts_at"
  | "ends_at"
  | "trigger"
  | "trigger_days"
  | "audience"
  | "audience_days"
  | "frequency"
  | "coupon";
export const FIELD_KEYS: ReadonlyArray<string> = [
  "title",
  "body",
  "cta_label",
  "cta_href",
  "plan_codes",
  "owner_emails",
  "offer_plan",
  "offer_price_inr",
  "placement",
  "starts_at",
  "ends_at",
  "trigger",
  "trigger_days",
  "audience",
  "audience_days",
  "frequency",
  "coupon",
];

export function linkError(href: string): string | null {
  const v = href.trim();
  if (!v) return null;
  if (v.startsWith("/") && !v.startsWith("//")) return null;
  if (v.startsWith("https://")) return null;
  if (/^mailto:[^@\s]+@[^@\s]+\.[^@\s]+$/i.test(v)) return null;
  if (v.startsWith("http://")) return "Use https:// (secure links only).";
  if (/^[^@\s/]+@[^@\s]+\.[^@\s]+$/.test(v)) return `For an email address, write mailto:${v}`;
  return "Use a dashboard page starting with / or an https:// link (or mailto:hello@zinwe.io).";
}

export type OfferMode = "coupon" | "price" | "link";

export function offerModeOf(d: Draft): OfferMode {
  if (d.coupon !== null) return "coupon";
  if (d.offer_plan) return "price";
  return "link";
}

export function validate(d: Draft, offerMode: OfferMode): Partial<Record<FieldKey, string>> {
  const e: Partial<Record<FieldKey, string>> = {};
  const ui = uiKindOf(d);
  if (!d.title.trim()) e.title = "Write the title owners will see.";
  if (needsDays(d.trigger) && !(d.trigger_days && d.trigger_days >= 1 && d.trigger_days <= 365)) e.trigger_days = "A number of days from 1 to 365.";
  if (d.audience === "plans" && d.plan_codes.length === 0 && d.placement !== "website") e.plan_codes = "Pick at least one plan.";
  if (d.audience === "owners") {
    if (d.placement === "website") e.placement = "A message for picked people shows on the dashboard.";
    else if (d.owner_emails.length === 0) e.owner_emails = "Add at least one person.";
  }
  if (d.audience === "quiet" && !(d.audience_days && d.audience_days >= 1 && d.audience_days <= 365)) e.audience_days = "A number of days from 1 to 365.";
  const priced = (ui === "offer" && offerMode === "price") || (ui === "announce" && Boolean(d.offer_plan));
  if (ui === "offer" && offerMode === "coupon" && d.coupon === null) e.coupon = "Pick a code from Coupons.";
  if (priced) {
    if (!d.offer_plan) e.offer_plan = "Pick the plan.";
    const price = Number(d.offer_price_inr);
    if (!d.offer_price_inr || !Number.isFinite(price)) e.offer_price_inr = "Write the special price.";
    else if (price < 1) e.offer_price_inr = "At least ₹1 (online payments can't be smaller).";
    if (d.placement === "website") e.placement = "Special prices show on the dashboard, where customers pay.";
  }
  const linkOwn = ui !== "feedback" && !(ui === "offer" && offerMode !== "link") && !(ui === "announce" && d.offer_plan);
  if (linkOwn) {
    const label = d.cta_label.trim();
    const href = d.cta_href.trim();
    if (label && !href) e.cta_href = "Add where the button goes, or clear the button text.";
    else if (href && !label) e.cta_label = "Add the button text, or clear the link.";
    const bad = linkError(href);
    if (bad) e.cta_href = bad;
  }
  if (d.ends_at && new Date(d.ends_at).getTime() <= new Date(d.starts_at).getTime()) e.ends_at = "The end must be after the start.";
  return e;
}

/** What paid plans may see as a pop-up (the server's rule): never offers. */
export function offerToPaid(d: Draft, plans: PlanSummary[]): boolean {
  if (d.placement !== "popup" || !(d.kind === "offer" || d.kind === "discount")) return false;
  if (d.audience === "paid") return true;
  if (d.audience === "plans") return d.plan_codes.some((c) => plans.find((p) => p.code === c && Number(p.price_inr_monthly) > 0));
  return false;
}

/** "Upgrade for ₹971 + GST": the button a special price gets when no button is written (whole rupees without .00). */
export function offerButton(price: string | null): string {
  const n = Number(price);
  if (!Number.isFinite(n) || n <= 0) return "Upgrade";
  const text = n.toLocaleString("en-IN", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return `Upgrade for ₹${text} + GST`;
}

export const AUDIENCE_SIMPLE: [AnnouncementAudience, string][] = [
  ["everyone", "Everyone"],
  ["owners", "Picked people"],
  ["new7", "New in first 7 days"],
  ["free", "Free"],
  ["paid", "Paid plans"],
];

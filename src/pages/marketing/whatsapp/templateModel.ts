/**
 * The Templates page (owner, 10 Nov 2026; board AdminWaTemplates): the words, the order and the numbers it shows.
 * Everything here reads the API's WaTemplate / WaContact and degrades when a newer field is missing.
 */
import type { WaCategory, WaContact, WaNumbers, WaReach, WaTemplate } from "../../../lib/whatsappApi";
import { isWritten, type Detail, type Who } from "./templateBlocks";
import { CATEGORIES, TRACKS } from "./shared";

export type Cat = Exclude<WaCategory, "">;
export const PATH_CATS: Cat[] = CATEGORIES.filter((c) => c !== "quick_reply");

/** Header line under the title, per category (board DESC). */
export const DESC: Record<Cat | "all", string> = {
  all: "Every message your team sends. The bubble shows how it reads on WhatsApp for the contact you preview as.",
  outreach: "Cold messages by day, 1–90. Each one goes once; one a day at most.",
  engage: "Questions after a YES. The answer sets the contact’s Track.",
  demo_video: "Short videos, by Track. A contact still Unassigned gets none.",
  setup: "Sign-up and the first PC.",
  demo_call: "A booking link when setup stops at an error.",
  offer: "The pack price with this stage’s live coupon.",
  testimonial: "Asked 14 days after the first PC.",
  quick_reply: "Answers to something they asked. Sent by hand, any time.",
};
/** The second line of each category in the menu. */
export const SUB: Record<Cat, string> = {
  outreach: "Cold, day 1–90", engage: "After a YES", demo_video: "By Track", setup: "First PC", demo_call: "On a setup error",
  offer: "Pack and coupon", testimonial: "After 14 days", quick_reply: "Answers, any time",
};
/** The step each category is for: the second bar on a card. */
export const NEXT: Partial<Record<Cat, string>> = {
  outreach: "said YES", offer: "paid", engage: "Track set", demo_video: "took the next step", setup: "took the next step",
  demo_call: "took the next step", testimonial: "gave one",
};
/** The two letters on a card's badge. */
export const BADGE: Record<Cat, string> = {
  outreach: "OU", engage: "EN", demo_video: "DV", setup: "SU", demo_call: "DC", offer: "OF", testimonial: "TE", quick_reply: "QR",
};
/** Steps per category (the backend's rules): Intro is a day 1–90, Offer a stage 1–3. */
export const STEPS: Partial<Record<Cat, number>> = { engage: 6, demo_video: 6, setup: 2, testimonial: 2 };

export const pct = (n: number, d: number): number => (d ? Math.round((n / d) * 100) : 0);
/** The reply % chip colour: green 40+, orange 15–39, red under 15, grey when nothing was sent. */
export const band = (rate: number, sends: number): string => (!sends ? "is-none" : rate >= 40 ? "is-good" : rate >= 15 ? "is-mid" : "is-low");
export const bandWord = (rate: number): string => (rate >= 40 ? "Working well" : rate >= 15 ? "OK" : "Weak");

export interface Num {
  sends: number;
  replies: number;
  rate: number;
}
export interface Numbers {
  total: Num;
  /** The next-step %, or null when the server doesn't say. */
  next: number | null;
  /** By the language it went out in; null on a server without the split. */
  en: Num | null;
  hi: Num | null;
  /** A and B on their own, while a version B is being tested. */
  a: Num | null;
  b: Num | null;
}

const num = (sends: number, replies: number, rate?: number): Num => ({ sends, replies, rate: rate ?? pct(replies, sends) });
const add = (x: Num, y: Num): Num => num(x.sends + y.sends, x.replies + y.replies);

function langNum(n: Partial<WaNumbers>, lang: "en" | "hi"): Num | null {
  const sends = n[`sends_${lang}`];
  if (typeof sends !== "number") return null;
  const rate = n[`reply_rate_${lang}`];
  const replies = n[`replies_${lang}`];
  return typeof replies === "number" ? num(sends, replies) : num(sends, Math.round(((rate ?? 0) * sends) / 100), rate);
}

/** The row's own numbers: `stats`, or the same keys on the row itself, or the older `performance`. */
function ownNumbers(t: WaTemplate): Partial<WaNumbers> | null {
  if (t.stats) return t.stats;
  const flat = t as unknown as Partial<WaNumbers>;
  if (typeof flat.sends === "number") return flat;
  return t.performance ?? null;
}

/** A card's numbers: A and B together, with each side when a version B runs. */
export function numbersOf(t: WaTemplate): Numbers {
  const own = ownNumbers(t) ?? { sends: 0, replies: 0 };
  const a = num(own.sends ?? 0, own.replies ?? 0);
  const b = t.version_b ? num(t.version_b.sends ?? 0, t.version_b.replies ?? 0) : null;
  const total = b ? add(a, b) : a;
  const nextOf = (n: Partial<WaNumbers>): number | null => (typeof n.next === "number" ? n.next : typeof n.next_rate === "number" ? Math.round((n.next_rate * (n.sends ?? 0)) / 100) : null);
  const nextA = nextOf(own);
  const nextB = t.version_b ? nextOf(t.version_b) : 0;
  const next = nextA === null ? null : pct(nextA + (nextB ?? 0), total.sends);
  const lang = (l: "en" | "hi"): Num | null => {
    const x = langNum(own, l);
    if (!x) return null;
    const y = t.version_b ? langNum(t.version_b, l) : null;
    return y ? add(x, y) : x;
  };
  return { total, next, en: lang("en"), hi: lang("hi"), a: b ? a : null, b };
}

/** Sum of a list's numbers for a menu chip; Quick replies answer a message, so they never count. */
export function sumOf(list: WaTemplate[]): Num {
  return list.filter((t) => t.category !== "quick_reply").map((t) => numbersOf(t).total).reduce(add, num(0, 0));
}

export const isDraft = (t: WaTemplate): boolean => (typeof t.draft === "boolean" ? t.draft : !(isWritten(t.text) && isWritten(t.text_hi)));

/** Path order: the categories in the order a contact meets them, then Track, stage and step. */
export const pathOrder = (t: WaTemplate): number =>
  CATEGORIES.indexOf(t.category as Cat) * 100000 + (t.track ? TRACKS.indexOf(t.track as (typeof TRACKS)[number]) * 1000 : 0) + (t.stage ?? 0) * 100 + (t.step ?? 0);

const short = (ymd: string | null | undefined): string =>
  ymd ? new Date(`${ymd}T12:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "";
const stageOfDay = (day: number): number => Math.min(3, Math.floor((Math.max(1, day) - 1) / 30) + 1);

/** "When it goes": Stage 1 · day 4, After YES · step 1, After Track · 2 of 6... */
export function whenOf(t: Pick<WaTemplate, "category" | "stage" | "step" | "coupon_info" | "event">): string {
  const step = t.step ?? 0;
  switch (t.category as Cat) {
    case "outreach": return `Stage ${t.stage || stageOfDay(step || 1)} · day ${step || 1}`;
    case "offer": {
      const c = t.coupon_info;
      const dates = c ? (c.ends_on ? `${short(c.starts_on)}–${short(c.ends_on)}` : `from ${short(c.starts_on)}`) : "no code yet";
      return `Stage ${t.stage || 1} · ${dates}${t.event ? " · festival" : ""}`;
    }
    case "engage": return `After YES · step ${step || 1}`;
    case "demo_video": return `After Track · ${step || 1} of 6`;
    case "setup": return `After the demo · step ${step || 1}`;
    case "demo_call": return "On a setup error";
    case "testimonial": return step === 2 ? "After the written one" : "14 days after the first PC";
    default: return "When they write";
  }
}

/** The day pill above the bubble. */
export function dayPill(t: WaTemplate): string {
  if (t.category === "outreach") return `Day ${t.step || 1}`;
  return t.category === "quick_reply" ? "When they write" : "In the path";
}

// ---- Preview as: a real contact ----

export interface PreviewContact {
  /** 0 = a sample (no contacts yet). */
  id: number;
  who: Who;
  /** The chat's title: their name, else the number. */
  title: string;
  /** In pickers: "Rohit Mehta · Mehta & Associates". */
  label: string;
  /** Short, for "as Rohit gets it". */
  short: string;
  initials: string;
}

/** Their real first name by the greeting rule (wa_names.address): the salutation says "Hi Rohit", not "Hello … team". */
export function firstNameOf(c: WaContact): string {
  if (c.known && typeof c.known.FirstName === "boolean") return c.known.FirstName ? c.greet_as : "";
  if (c.salutation) return c.salutation.startsWith("Hi ") ? c.salutation.slice(3).trim() : "";
  const business = c.short_name || c.firm;
  return c.greet_as && c.greet_as !== `${business} team` ? c.greet_as : "";
}

const initialsOf = (s: string): string =>
  s.replace(/^Dr\.? /i, "").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";

export function previewOf(c: WaContact): PreviewContact {
  const first = firstNameOf(c);
  const business = c.short_name || c.firm;
  const who: Who = {
    FirstName: first, OwnerName: (c.owner_name ?? "").trim(), Business: business, City: (c.city ?? "").trim(),
    HowWeKnow: (c.how_we_know ?? c.info?.how_we_know ?? "").trim(),
  };
  const person = c.info?.contact_name || (first ? c.first_name || first : "");
  const title = person || c.phone;
  const label = first ? `${person || first} · ${business}` : who.OwnerName ? `No first name · ${business} (owner ${who.OwnerName})` : `No names · ${business}`;
  return { id: c.id, who, title, label, short: first ? person.split(" ")[0] || first : business, initials: initialsOf(person || business) };
}

/** Three sample contacts, only for when there are no real ones yet. */
export const SAMPLES: PreviewContact[] = [
  { id: 0, who: { FirstName: "Rohit", OwnerName: "", Business: "Mehta & Associates", City: "Jaipur", HowWeKnow: "We found your firm on the ICAI Jaipur list." }, title: "Rohit Mehta", label: "Sample · Rohit Mehta · Mehta & Associates", short: "Rohit", initials: "RM" },
  { id: -1, who: { FirstName: "", OwnerName: "Anil Gupta", Business: "Webgross", City: "Delhi", HowWeKnow: "" }, title: "+91 98290 41766", label: "Sample · No first name · Webgross (owner Anil Gupta)", short: "Webgross", initials: "WG" },
  { id: -2, who: { FirstName: "", OwnerName: "", Business: "Sharma Exports", City: "", HowWeKnow: "" }, title: "+91 99280 10553", label: "Sample · No names · Sharma Exports", short: "Sharma Exports", initials: "SE" },
];

export interface QuickPicks {
  first: PreviewContact | null;
  noFirst: PreviewContact | null;
  noNames: PreviewContact | null;
}

/** The quick picks: one with a first name, one without (an owner name if any has one), one with no names at all.
 * The server's reach.examples wins when it names them. */
export function quickPicks(all: PreviewContact[], examples?: WaReach["examples"]): QuickPicks {
  if (!all.length) return { first: SAMPLES[0], noFirst: SAMPLES[1], noNames: SAMPLES[2] };
  const byId = (id: number | null | undefined) => (id ? all.find((p) => p.id === id) ?? null : null);
  const first = byId(examples?.first_name) ?? all.find((p) => p.who.FirstName) ?? null;
  const noFirst = byId(examples?.no_first_name) ?? all.find((p) => !p.who.FirstName && p.who.OwnerName) ?? all.find((p) => !p.who.FirstName) ?? null;
  const noNames = byId(examples?.no_names) ?? all.find((p) => !p.who.FirstName && !p.who.OwnerName) ?? null;
  return { first, noFirst, noNames };
}

export const knownFor = (who: Who, d: Detail): boolean => d === "Business" || !!who[d];
